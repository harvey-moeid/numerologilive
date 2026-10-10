import {authorized,json} from "../../_lib/overlay-config.mjs";
export async function onRequestGet({request,env}) {
  const access=authorized(request,env);
  if(access==="unconfigured") return json({ok:false,error:"Token admin belum dikonfigurasi"},503);
  if(!access) return json({ok:false,error:"Akses admin ditolak"},401);
  const secret=env.NUMEROLOGY_WEBHOOK_SECRET;
  if(typeof secret!=="string" || secret.length<2 || secret.length>512)
    return json({ok:false,error:"NUMEROLOGY_WEBHOOK_SECRET harus 2–512 karakter"},503);
  if(!env.NUMEROLOGY_CONFIG_R2) return json({ok:false,error:"Binding R2 belum tersedia"},503);
  const url=new URL("/api/tiktok/webhook",request.url);
  url.searchParams.set("secret",secret);
  return json({ok:true,url:url.toString()});
}
