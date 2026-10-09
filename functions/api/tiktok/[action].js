import { handleTikTokRequest } from "../../_lib/tiktok-proxy.mjs";

export function onRequestGet({ request, env, params }) {
  return handleTikTokRequest(request, env, params.action);
}
