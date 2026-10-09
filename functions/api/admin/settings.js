import { json, readSettings, authorized, OBJECT_KEY } from "../../_lib/overlay-config.mjs";
import { normalizeSettings } from "../../../overlay-settings.mjs";

export async function onRequest({request,env}) {
  if (!["GET","PUT"].includes(request.method)) return json({ok:false,error:"Metode tidak diizinkan"},405);
  const status=authorized(request,env);
  if (status==="unconfigured") return json({ok:false,error:"NUMEROLOGY_ADMIN_TOKEN belum diatur (minimal 2 karakter)"},503);
  if (!status) return json({ok:false,error:"Token admin tidak valid"},401);
  if (!env.NUMEROLOGY_CONFIG_R2) return json({ok:false,error:"Binding NUMEROLOGY_CONFIG_R2 belum terpasang"},503);
  if (request.method==="GET") {
    try { return json({ok:true,settings:await readSettings(env.NUMEROLOGY_CONFIG_R2)}); }
    catch { return json({ok:false,error:"Gagal membaca JSON R2"},503); }
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ok:false,error:"Origin tidak diizinkan"},403);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json"))
    return json({ok:false,error:"Content-Type harus application/json"},415);
  let body;
  try {
    if (Number(request.headers.get("Content-Length")||0) > 8192) return json({ok:false,error:"Data terlalu besar"},413);
    const raw=await request.text();
    if(raw.length > 8192) return json({ok:false,error:"Data terlalu besar"},413);
    body=JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("invalid");
    if (!Array.isArray(body.contexts) || body.contexts.length===0 ||
        !body.contexts.some(x=>["general","love","career","strengths","challenges","advice"].includes(x)))
      return json({ok:false,error:"Pilih minimal satu konteks bacaan"},400);
    if (body.likesEnabled===false && body.giftsEnabled===false)
      return json({ok:false,error:"Aktifkan minimal satu pemicu gift atau like"},400);
    for(const field of ["likeThreshold","giftMinimum","durationSeconds"]) {
      if (!Number.isSafeInteger(body[field]) || body[field]<1) return json({ok:false,error:"Nilai "+field+" harus bilangan positif"},400);
    }
  } catch { return json({ok:false,error:"Payload JSON tidak valid"},400); }
  if (body.dobMode !== undefined && !["strict","flexible"].includes(body.dobMode))
    return json({ok:false,error:"Mode parser tidak dikenal"},400);
  for (const field of ["dobAutoCorrect","dobErrorNotices"])
    if (body[field] !== undefined && typeof body[field] !== "boolean")
      return json({ok:false,error:"Nilai "+field+" harus boolean"},400);
  if (body.dobNoticeCooldownSeconds !== undefined &&
      (!Number.isSafeInteger(body.dobNoticeCooldownSeconds) ||
       body.dobNoticeCooldownSeconds < 10 || body.dobNoticeCooldownSeconds > 180))
    return json({ok:false,error:"Jeda notifikasi harus 10–180 detik"},400);
  if (body.dobHelpText !== undefined &&
      (typeof body.dobHelpText !== "string" || body.dobHelpText.length > 120))
    return json({ok:false,error:"Teks contoh maksimal 120 karakter"},400);
  const settings=normalizeSettings(body);
  try {
    await env.NUMEROLOGY_CONFIG_R2.put(OBJECT_KEY,JSON.stringify(settings),{
      httpMetadata:{contentType:"application/json; charset=utf-8"}
    });
    return json({ok:true,settings});
  } catch { return json({ok:false,error:"Gagal menyimpan pengaturan ke R2"},503); }
}
