import {test} from "node:test";
import assert from "node:assert/strict";
import {onRequestGet as adminUrl} from "../functions/api/admin/webhook-url.js";
import {onRequestPost as incoming, onRequestGet as overlayFeed} from "../functions/api/tiktok/webhook.js";

const mockR2=()=>{
  const objects=new Map();
  return {
    async head(key){return objects.has(key)?{key}:null;},
    async put(key,value){objects.set(key,value);},
    async get(key){return objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null;},
    async list(){return {objects:[],truncated:false}}
  };
};
const env=(secret="a9")=>({
  NUMEROLOGY_ADMIN_TOKEN:"XY",
  NUMEROLOGY_WEBHOOK_SECRET:secret,
  TLK_OVERLAY_TOKEN:"test-overlay-secret-abcdefghijklmnopqrstuvwxyz",
  NUMEROLOGY_CONFIG_R2:mockR2()
});
const adminReq=(token="XY")=>new Request("https://numerology.muidsoft.com/api/admin/webhook-url",{
  headers:{Authorization:"Bearer "+token}
});
const incomingReq=(secret,event)=>new Request("https://numerology.muidsoft.com/api/tiktok/webhook?secret="+encodeURIComponent(secret),{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event)
});
const event=()=>({id:"event-test-123",event:"chat",timestamp:new Date().toISOString(),roomId:"room1",data:{username:"viewer",message:"halo"}});

test("admin gives a copy-ready URL for two-character webhook tokens",async()=>{
  const e=env("a9");
  const res=await adminUrl({request:adminReq(),env:e});
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(new URL(data.url).searchParams.get("secret"),"a9");
  assert.equal((await adminUrl({request:adminReq("wrong"),env:e})).status,401);
  assert.equal((await adminUrl({request:adminReq(),env:env("a")})).status,503);
  assert.equal((await adminUrl({request:adminReq(),env:env("z".repeat(513))})).status,503);
});
test("incoming webhook accepts two chars but rejects wrong or one-char secrets",async()=>{
  const e=env("a9");
  const payload=event();
  assert.equal((await incoming({request:incomingReq("wrong",payload),env:e})).status,401);
  assert.equal((await incoming({request:incomingReq("a9",payload),env:e})).status,200);
  const again=await incoming({request:incomingReq("a9",payload),env:e});
  assert.equal((await again.json()).duplicate,true);
  assert.equal((await incoming({request:incomingReq("a",payload),env:env("a")})).status,401);
});
test("overlay GET still requires a long independent token",async()=>{
  const e=env("a9");
  const makeReq=token=>new Request("https://numerology.muidsoft.com/api/tiktok/webhook",{
    headers:{Authorization:"Bearer "+token}
  });
  assert.equal((await overlayFeed({request:makeReq("a9"),env:e})).status,401);
  assert.equal((await overlayFeed({request:makeReq(e.TLK_OVERLAY_TOKEN),env:e})).status,200);
  assert.equal((await overlayFeed({request:makeReq("a9"),env:{...e,TLK_OVERLAY_TOKEN:"a9"}})).status,401);
});
