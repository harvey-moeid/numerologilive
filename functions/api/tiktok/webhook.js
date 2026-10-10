import {json} from "../../_lib/overlay-config.mjs";
const PREFIX="webhook-events/";
function same(a,b,minLength=2) {
  if(typeof a!=="string"||typeof b!=="string"||b.length<minLength||b.length>512||a.length!==b.length)return false;
  let result=0;
  for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);
  return result===0;
}
const allowed=new Set(["chat","like","gift","stream"]);
export async function onRequestPost({request,env}) {
  if(!same(new URL(request.url).searchParams.get("secret"),env.NUMEROLOGY_WEBHOOK_SECRET))
    return json({ok:false,error:"Unauthorized"},401);
  const bucket=env.NUMEROLOGY_CONFIG_R2;
  if(!bucket)return json({ok:false,error:"R2 unavailable"},503);
  if(!(request.headers.get("content-type")||"").toLowerCase().includes("application/json"))
    return json({ok:false,error:"JSON required"},415);
  let raw;
  try {raw=await request.text();if(raw.length>16384)return json({ok:false,error:"Too large"},413);}
  catch{return json({ok:false,error:"Cannot read payload"},400);}
  let event;
  try{event=JSON.parse(raw);}catch{return json({ok:false,error:"Bad JSON"},400);}
  if(!event||typeof event!=="object"||Array.isArray(event)||typeof event.id!=="string"||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(event.id)||!allowed.has(event.event)||
      !event.data||typeof event.data!=="object"||Array.isArray(event.data))
    return json({ok:false,error:"Invalid event"},400);
  const now=Date.now();
  // Date prefix enables chronological enumeration and allows idempotent retry keys.
  // Event identifiers are sanitized before becoming keys.
  const timestamp=Date.parse(event.timestamp);
  if(!Number.isFinite(timestamp)||Math.abs(now-timestamp)>10*60*1000)
    return json({ok:false,error:"Stale event"},400);
  const key=PREFIX+new Date(timestamp).toISOString().slice(0,10)+"/"+String(timestamp).padStart(13,"0")+"-"+event.id+".json";
  const existing=await bucket.head(key);
  if(existing)return json({ok:true,duplicate:true});
  const normalized={id:event.id,event:event.event,timestamp:new Date(timestamp).toISOString(),roomId:String(event.roomId||"").slice(0,64),data:event.data};
  await bucket.put(key,JSON.stringify(normalized),{httpMetadata:{contentType:"application/json"}});
  return json({ok:true});
}
export async function onRequestGet({request,env}) {
  const expected=env.TLK_OVERLAY_TOKEN;
  const supplied=/^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization")||"")?.[1]||"";
  if(!same(supplied,expected,24))return json({ok:false,error:"Unauthorized"},401);
  const bucket=env.NUMEROLOGY_CONFIG_R2;
  if(!bucket)return json({ok:false,error:"R2 unavailable"},503);
  const query=new URL(request.url).searchParams;
  const since=Math.min(Date.now(),Math.max(Date.now()-10*60*1000,Number(query.get("since"))||Date.now()));
  const dates=[new Date(since).toISOString().slice(0,10),new Date().toISOString().slice(0,10)];
  const found=[];
  for(const date of new Set(dates)){
    let cursor;
    do {
      const page=await bucket.list({prefix:PREFIX+date+"/",cursor,limit:1000});
      for(const object of page.objects||[]){
        const match=/\/(\d{13})-/.exec(object.key);
        if(match&&Number(match[1])>since)found.push(object.key);
      }
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor&&found.length<600);
  }
  const selected=found.sort().slice(-200);
  const events=(await Promise.all(selected.map(async key=>{try{return await (await bucket.get(key))?.json();}catch{return null;}}))).filter(Boolean);
  return json({ok:true,events});
}
