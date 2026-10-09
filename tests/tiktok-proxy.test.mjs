import { test } from "node:test";
import assert from "node:assert/strict";
import { handleTikTokRequest } from "../functions/_lib/tiktok-proxy.mjs";

const API_KEY = "private-connector-api-key";
const TOKEN = "overlay-test-secret-abcdefghijklmnopqrstuvwxyz";
const env = { TLK_API_KEY: API_KEY, TLK_OVERLAY_TOKEN: TOKEN };
const request = (path, bearer) => new Request("https://numerology.muidsoft.com/api/tiktok/" + path, {
  headers: bearer ? { Authorization: "Bearer " + bearer } : {},
});
const upstream = (body = {}) => async (_url, options) => {
  assert.equal(options.headers.Authorization, "Bearer " + API_KEY);
  assert.equal(options.redirect, "manual");
  return Response.json({ ok: true, ...body });
};

test("public status omits upstream secrets, user identifiers and top gifter", async () => {
  const res = await handleTikTokRequest(request("status"), env, "status", upstream({
    running: true, status: "Connected", username: "jalurtarot", engine: "node",
    stats: { chat: 8, likes: 41, topGifter: [{ username: "private" }], giftCoins: 7 },
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.running, true);
  assert.equal(body.stats.likes, 41);
  assert.equal(JSON.stringify(body).includes("private"), false);
  assert.equal(res.headers.get("Cache-Control"), "no-store, private");
});

test("events require separate long overlay token", async () => {
  let called = false;
  const fetcher = async () => { called = true; return Response.json({ ok: true, events: [] }); };
  assert.equal((await handleTikTokRequest(request("events"), env, "events", fetcher)).status, 401);
  assert.equal((await handleTikTokRequest(request("events", API_KEY), env, "events", fetcher)).status, 401);
  assert.equal(called, false);
  const result = await handleTikTokRequest(request("events", TOKEN), env, "events", fetcher);
  assert.equal(result.status, 200);
  assert.equal(called, true);
});

test("events URL clamps limit and drops unsupported query options", async () => {
  const r = await handleTikTokRequest(
    request("events?limit=99999&type=chat,bad,gift&before=secret", TOKEN), env, "events",
    async url => {
      const u = new URL(url);
      assert.equal(u.pathname, "/api/v1/events");
      assert.equal(u.searchParams.get("limit"), "200");
      assert.equal(u.searchParams.get("type"), "chat,gift");
      assert.equal(u.searchParams.has("before"), false);
      return Response.json({ ok: true, events: [{ id: "a", event: "chat" }] });
    },
  );
  assert.equal((await r.json()).events[0].id, "a");
});

test("rejects absent secret, invalid method or route", async () => {
  assert.equal((await handleTikTokRequest(request("status"), {}, "status", upstream())).status, 503);
  assert.equal((await handleTikTokRequest(request("delete"), env, "delete", upstream())).status, 404);
  assert.equal((await handleTikTokRequest(new Request("https://x/api/tiktok/status", { method: "POST" }), env, "status", upstream())).status, 404);
});

test("rejects unsafe base URLs and handles upstream errors without leaking keys", async () => {
  assert.equal((await handleTikTokRequest(request("status"), { ...env, TLK_BASE_URL: "http://localhost" }, "status", upstream())).status, 503);
  const res = await handleTikTokRequest(request("status"), env, "status", async () => new Response("SECRET", { status: 401 }));
  assert.equal(res.status, 502);
  assert.equal(JSON.stringify(await res.json()).includes("SECRET"), false);
  assert.equal((await handleTikTokRequest(request("status"), env, "status", async () => { throw Error("TOKEN"); })).status, 502);
});
