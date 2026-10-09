// Server-only proxy for TikTok LIVE connector. Never expose TLK_API_KEY to browsers.
const ACTIONS = new Set(["status", "stats", "events"]);
const TYPES = new Set(["chat", "like", "gift", "follow", "share", "member", "viewer", "stream"]);
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

function matchesSecret(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string" || expected.length < 24 ||
      actual.length !== expected.length || actual.length > 512) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function safeInt(value, fallback, max) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : fallback;
}
const safeCount = x => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0;
function aggregate(s) {
  return {
    chat: safeCount(s?.chat), likes: safeCount(s?.likes), gifts: safeCount(s?.gifts),
    giftCoins: safeCount(s?.giftCoins), follows: safeCount(s?.follows),
    viewerCount: safeCount(s?.viewerCount), peakViewers: safeCount(s?.peakViewers),
  };
}
function safeStatus(body) {
  return {
    ok: true, status: String(body?.status || "Unknown").slice(0, 32),
    running: body?.running === true, engine: ["node", "python", "none"].includes(body?.engine) ? body.engine : "none",
    username: String(body?.username || "").slice(0, 64),
    lastEventAt: body?.lastEventAt || null, stats: aggregate(body?.stats),
  };
}
function safeStats(body) {
  return { ok: true, username: String(body?.username || "").slice(0, 64), stats: aggregate(body?.stats) };
}

export async function handleTikTokRequest(request, env, action, upstreamFetch = fetch) {
  if (request.method !== "GET" || !ACTIONS.has(action)) return json({ error: "Tidak ditemukan" }, 404);
  const apiKey = typeof env?.TLK_API_KEY === "string" ? env.TLK_API_KEY.trim() : "";
  if (!apiKey) return json({ error: "Koneksi TikTok belum dikonfigurasi di Cloudflare" }, 503);
  if (action === "events") {
    const auth = request.headers.get("Authorization") || "";
    const supplied = /^Bearer\s+(.+)$/i.exec(auth)?.[1] || "";
    if (!matchesSecret(supplied, env?.TLK_OVERLAY_TOKEN))
      return json({ error: "Akses overlay ditolak" }, 401);
  }

  let upstreamBase;
  try {
    upstreamBase = new URL(env?.TLK_BASE_URL || "https://tiktok-live-konektor.onrender.com");
    if (upstreamBase.protocol !== "https:" || upstreamBase.username || upstreamBase.password ||
        upstreamBase.search || upstreamBase.hash || upstreamBase.pathname !== "/") throw Error("Bad base");
  } catch { return json({ error: "Konfigurasi URL konektor tidak valid" }, 503); }
  const uri = new URL("/api/v1/" + action, upstreamBase);
  if (action === "events") {
    const source = new URL(request.url);
    const requested = String(source.searchParams.get("type") || "chat,like,gift,stream").split(",")
      .map(x => x.trim()).filter(x => TYPES.has(x));
    uri.searchParams.set("type", [...new Set(requested.length ? requested : ["chat", "like", "gift", "stream"])].join(","));
    uri.searchParams.set("limit", String(safeInt(source.searchParams.get("limit"), 100, 200)));
  }

  try {
    const upstream = await upstreamFetch(uri.toString(), {
      method: "GET", headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
      redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      const status = [401, 403, 429, 503].includes(upstream.status) ? (upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status) : 502;
      return json({ error: "API konektor tidak tersedia", upstreamStatus: upstream.status }, status);
    }
    const body = await upstream.json();
    if (!body || typeof body !== "object" || body.ok !== true)
      return json({ error: "Respons konektor tidak valid" }, 502);
    if (action === "status") return json(safeStatus(body));
    if (action === "stats") return json(safeStats(body));
    const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
    return json({ ok: true, count: events.length, events });
  } catch { return json({ error: "Gagal terhubung ke TikTok LIVE Konektor" }, 502); }
}
