import { DEFAULT_SETTINGS, normalizeSettings } from "../../overlay-settings.mjs";

export const OBJECT_KEY = "settings/overlay.json";
export const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: HEADERS});
}
export async function readSettings(bucket) {
  if (!bucket || typeof bucket.get !== "function") throw new Error("R2_NOT_CONFIGURED");
  const item = await bucket.get(OBJECT_KEY);
  if (!item) return {...DEFAULT_SETTINGS, contexts:[...DEFAULT_SETTINGS.contexts]};
  const data = await item.json();
  return normalizeSettings(data);
}
export function authorized(request, env) {
  const expected = typeof env.NUMEROLOGY_ADMIN_TOKEN === "string" ? env.NUMEROLOGY_ADMIN_TOKEN.trim() : "";
  if (expected.length < 2 || expected.length > 512) return "unconfigured";
  const found = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "")?.[1] || "";
  if (found.length !== expected.length) return false;
  let diff=0;
  for(let i=0; i<expected.length; i++) diff |= expected.charCodeAt(i)^found.charCodeAt(i);
  return diff===0;
}
