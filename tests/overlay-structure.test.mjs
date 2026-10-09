import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../live.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../live-overlay.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../live-overlay.mjs", import.meta.url), "utf8");
const svg = readFileSync(new URL("../assets/overlay/celestial-hall.svg", import.meta.url), "utf8");

test("premium overlay retains DOM bindings for event processing and authentication", () => {
  const required = ["card","reason","person","lifeNumber","lifeName","lifeReading",
    "idle","pending","giftHint","likeHint","liveDot","liveDotLabel",
    "connectionMessage","unlock","unlockForm","token","connectBtn","unlockError"];
  for (const id of required)
    assert.match(html, new RegExp('id="' + id + '"'), "missing: " + id);
  assert.match(html, /src="\/live-overlay\.mjs"/);
  assert.match(html, /src="\/calculator\.js"/);
  assert.match(html, /src="\/interpretations\.js"/);
});

test("premium overlay supports privacy-safe previews and real LIVE mode", () => {
  assert.match(js, /qp\.get\("preview"\) === "1"/);
  assert.match(js, /status\.running/);
  assert.match(js, /"liveDotLabel"/);
  assert.match(js, /"events\?type=chat,like,gift,stream&limit=200"/);
  assert.match(js, /request\("events\?limit=1",true\)/);
  assert.match(js, /"numerology_overlay_token"/);
  assert.doesNotMatch(html, /Bearer [A-Za-z0-9_-]{24,}/);
});

test("portrait, landscape, transparent and reduced-motion variants retain atmosphere", () => {
  assert.match(css, /max-aspect-ratio:\s*3\/4/);
  assert.match(css, /max-height:\s*520px/);
  assert.match(css, /html\.transparent \.scene\s*\{\s*display:none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /url\("\/assets\/overlay\/celestial-hall\.svg"\)/);
  assert.match(svg, /^<\?xml version="1\.0"/);
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<clipPath id="leftGate"/);
});
