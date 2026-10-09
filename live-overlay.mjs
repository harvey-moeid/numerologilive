import { LiveEngine } from "/live-engine.mjs";

const $ = id => document.getElementById(id);
const qp = new URLSearchParams(location.search);
const clamped = (value, fallback) => { const n = Number(value); return Number.isSafeInteger(n) && n >= 1 && n <= 100000 ? n : fallback; };
const likes = clamped(qp.get("likes"),400), gift = clamped(qp.get("gift"),1);
const engine = new LiveEngine({likeThreshold:likes, giftMinimum:gift});
$("giftHint").textContent = "gift ≥ " + gift + " koin";
$("likeHint").textContent = likes + " like";
let token = ""; let started = false; let polling = false; let timer = null; let lastStatus = 0;
let displayTimer = null; let pendingTimer = null; const displayQueue = [];
const setConnection = message => { $("connectionMessage").textContent = message; };
function showCard(item) {
  const [year,month,day] = item.iso.split("-").map(Number);
  const n = calculateLifePath(day,month,year);
  const info = getInterpretation(n);
  if (!info) return;
  $("reason").textContent = item.via === "gift" ? "🎁 GIFT · " + (item.giftName || "Hadiah") : "💗 " + likes + " LIKE";
  $("person").textContent = "@" + item.nickname;
  $("lifeNumber").textContent = n;
  $("lifeName").textContent = info.title;
  $("lifeReading").textContent = info.summary;
  $("idle").hidden = true; $("card").hidden = false;
}
function advanceQueue() {
  clearTimeout(displayTimer);
  if (!displayQueue.length) { $("card").hidden = true; $("idle").hidden = false; return; }
  showCard(displayQueue.shift());
  displayTimer = setTimeout(advanceQueue, clamped(qp.get("duration"),13) * 1000);
}
function handleEvent(event) {
  const result = engine.handle(event);
  if (!result) return;
  if (result.type === "pending") {
    $("pending").hidden = false;
    $("pending").textContent = "✨ Tanggal lahir @" + result.nickname + " diterima. Menunggu gift / like...";
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { $("pending").hidden = true; }, 5500);
    return;
  }
  if (result.type === "result") {
    displayQueue.push(result);
    if (displayQueue.length > 20) displayQueue.shift();
    if ($("card").hidden) advanceQueue();
  }
}
async function request(path, auth=false) {
  const res = await fetch("/api/tiktok/" + path, {
    headers: auth ? {Authorization:"Bearer " + token} : {},
    cache:"no-store",
  });
  if (res.status === 401 && auth) {
    started = false; clearTimeout(timer); sessionStorage.removeItem("numerology_overlay_token");
    $("unlock").hidden = false; $("unlockError").textContent = "Token salah atau sudah diganti.";
    throw Error("401");
  }
  if (!res.ok) throw Error("HTTP " + res.status);
  return res.json();
}
async function poll() {
  if (!started || polling) return;
  polling = true;
  try {
    const data = await request("events?type=chat,like,gift,stream&limit=200",true);
    const events = Array.isArray(data.events) ? data.events : [];
    // Avoid replaying old comments/gifts when OBS opens a source mid-LIVE.
    if (!window.__liveBaselineEstablished) {
      for(const event of events) engine.markSeen(event);
      window.__liveBaselineEstablished = true;
    } else {
      for (const event of events.slice().reverse()) handleEvent(event);
    }
    if (Date.now() - lastStatus > 14000) {
      lastStatus = Date.now();
      const status = await request("status");
      $("liveDot").textContent = status.running ? "● LIVE" : "OFFLINE";
      $("liveDot").classList.toggle("on", status.running);
      setConnection(status.running ? "Terhubung ke @" + (status.username || "TikTok LIVE") :
        "Konektor siap · siaran belum aktif");
    }
  } catch (err) {
    if (started) setConnection("Koneksi event terputus · mencoba ulang");
  } finally {
    polling = false;
    if (started) timer = setTimeout(poll, 2000);
  }
}
async function activate(value) {
  token = String(value || "").trim();
  if (token.length < 24) { $("unlockError").textContent = "Token minimal 24 karakter."; return; }
  $("connectBtn").disabled = true;
  $("unlockError").textContent = "";
  try {
    const data = await request("events?limit=1",true);
    if (!data.ok) throw Error("Gagal");
    sessionStorage.setItem("numerology_overlay_token", token);
    $("unlock").hidden = true;
    started = true; window.__liveBaselineEstablished = false;
    poll();
  } catch {
    $("unlock").hidden = false;
    if (!$("unlockError").textContent) $("unlockError").textContent = "Tidak dapat menghubungi API event. Periksa secret Cloudflare dan konektor.";
  } finally { $("connectBtn").disabled = false; }
}
$("unlockForm").addEventListener("submit", event=>{event.preventDefault();activate($("token").value);});
const fragment = new URLSearchParams(location.hash.replace(/^#/,""));
const fromFragment = fragment.get("access");
if (fromFragment) {
  history.replaceState(null,"",location.pathname+location.search);
  activate(fromFragment);
} else {
  const saved = sessionStorage.getItem("numerology_overlay_token");
  if (saved) activate(saved);
}
