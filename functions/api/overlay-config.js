import { json, readSettings } from "../_lib/overlay-config.mjs";
export async function onRequestGet({env}) {
  try {
    const settings = await readSettings(env.NUMEROLOGY_CONFIG_R2);
    return json({ok:true,settings});
  } catch {
    return json({ok:false,error:"Pengaturan overlay tidak tersedia. Periksa R2 binding."},503);
  }
}
