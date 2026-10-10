import {authorized,json} from "../../_lib/overlay-config.mjs";
export async function onRequestGet({request,env}) {
  const access=authorized(request,env);
  if(access==="unconfigured") return json({ok:false,error:"Token admin belum dikonfigurasi"},503);
  if(!access) return json({ok:false,error:"Akses admin ditolak"},401);
  if(!env.NUMEROLOGY_WEBHOOK_SECRET || env.NUMEROLOGY_WEBHOOK_SECRET.length<32)
    return json({ok:false,error:"NUMEROLOGY_WEBHOOK_SECRET belum diatur"},503);
  if(!env.NUMEROLOGY_CONFIG_R2) return json({ok:false,error:"Binding R2 belum tersedia"},503);
  const url=new URL("/api/tiktok/webhook",request.url);
  url.searchParams.set("secret",env.NUMEROLOGY_WEBHOOK_SECRET);
  return json({ok:true,url:url.toString()});
}
