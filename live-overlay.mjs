import { LiveEngine } from "/live-engine.mjs";
import { DEFAULT_SETTINGS, normalizeSettings, formatReading } from "/overlay-settings.mjs";

const $ = id => document.getElementById(id);
const qp = new URLSearchParams(location.search);
const clamped = (value, fallback) => { const n = Number(value); return Number.isSafeInteger(n) && n >= 1 && n <= 100000 ? n : fallback; };
let settings = normalizeSettings(DEFAULT_SETTINGS);
let likes = clamped(qp.get("likes"),settings.likeThreshold), gift = clamped(qp.get("gift"),settings.giftMinimum);
const engine = new LiveEngine({likeThreshold:likes, giftMinimum:gift});
$("giftHint").textContent = "gift ≥ " + gift + " koin";
$("likeHint").textContent = likes + " like";
let token = ""; let started = false; let polling = false; let timer = null; let lastStatus = 0;
let webhookSince = Date.now(); let displayTimer = null; let pendingTimer = null; const displayQueue = [];
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
  $("lifeReading").textContent = formatReading(info,settings.contexts);
  const card = $("card");
  card.dataset.via = item.via === "like" ? "like" : "gift";
  $("idle").hidden = true;
  card.hidden = false;
  applyVisibility();
  // Restart entrance animation for consecutive readings without hiding their content.
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
}
function advanceQueue() {
  clearTimeout(displayTimer);
  if (!displayQueue.length) { $("card").hidden = true; $("idle").hidden = false; return; }
  showCard(displayQueue.shift());
  displayTimer = setTimeout(advanceQueue, clamped(qp.get("duration"),settings.durationSeconds) * 1000);
}
function handleEvent(event) {
  if (event?.event === "gift" && !settings.giftsEnabled) return;
  if (event?.event === "like" && !settings.likesEnabled) return;
  const result = engine.handle(event);
  if (!result) return;
  if (result.type === "pending" || result.type === "invalid") {
    $("pending").hidden = false;
    $("pending").dataset.kind = result.type;
    const format = settings.dobMode === "strict" ? "DD/MM/YYYY" : "16/11/1996 atau 16 Nov 1996";
    $("pending").textContent = result.type === "pending"
      ? "✨ Tanggal lahir @" + result.nickname + " diterima. Menunggu gift / like..."
      : result.reason === "ambiguous"
        ? "✨ @" + result.nickname + ", kirim satu tanggal lahir saja ya. Contoh: 16/11/1996"
        : "✨ @" + result.nickname + ", tanggal belum terbaca. Coba tulis " + format;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { $("pending").hidden = true; }, result.type === "invalid" ? 6500 : 5500);
    return;
  }
  if (result.type === "result") {
    displayQueue.push(result);
    if (displayQueue.length > 20) displayQueue.shift();
    if ($("card").hidden) advanceQueue();
  }
}
function applyVisibility() {
  const display = (selector, enabled) => {
    const el=document.querySelector(selector);
    if (el) el.hidden=!enabled;
  };
  display(".brand-plaque",settings.showBrand);
  display(".brand-ornament-left",settings.showBrand);
  display(".brand-ornament-right",settings.showBrand);
  display(".reason-wrap",settings.showReason);
  display(".recipient-label",settings.showUsername);
  display("#person",settings.showUsername);
  display(".number-orbit",settings.showNumber);
  display("#lifeName",settings.showTitle);
  display(".disclaimer",settings.showDisclaimer);
  display(".steps",settings.showInstructions);
}
async function reloadSettings() {
  try {
    const response=await fetch("/api/overlay-config",{cache:"no-store"});
    if (!response.ok) return;
    const data=await response.json();
    if (!data?.ok || !data.settings) return;
    settings=normalizeSettings(data.settings);
    likes=clamped(qp.get("likes"),settings.likeThreshold);
    gift=clamped(qp.get("gift"),settings.giftMinimum);
    engine.likeThreshold=likes;
    engine.giftMinimum=gift;
    engine.dobMode=settings.dobMode;
    engine.dobAutoCorrect=settings.dobAutoCorrect;
    engine.dobErrorNotices=settings.dobErrorNotices;
    engine.dobNoticeCooldownSeconds=settings.dobNoticeCooldownSeconds;
    $("dobHint").textContent=settings.dobMode==="strict"?"Format wajib: DD/MM/YYYY":settings.dobHelpText;
    $("giftHint").textContent=settings.giftsEnabled?"gift ≥ "+gift+" koin":"gift dinonaktifkan";
    $("likeHint").textContent=settings.likesEnabled?likes+" like":"like dinonaktifkan";
    document.querySelector(".brand strong").textContent=settings.siteName;
    document.querySelector(".idle h1").textContent=settings.idleTitle;
    document.querySelector(".idle-intro").textContent=settings.idleIntro;
    document.querySelector(".disclaimer").textContent=settings.footerNote;
    applyVisibility();
    if (qp.get("preview") === "1") {
      showCard({ nickname: "penonton_live", iso: "1996-11-16", via: "gift", giftName: "Rose" });
    } else if (!$("card").hidden) {
      // Rerender the displayed context on the next result to avoid replacing a reading midstream.
    }
  } catch {
    // Preserve last known valid configuration on temporary network/storage failures.
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
    // Receive authenticated webhook deliveries as an additional event source.
    // The existing poll remains a fallback; LiveEngine deduplicates by event.id.
    const watermark=Date.now();
    try {
      const res=await fetch("/api/tiktok/webhook?since="+webhookSince,{
        headers:{Authorization:"Bearer "+token},cache:"no-store"
      });
      if(res.ok){
        const feed=await res.json();
        for(const event of feed.events||[])handleEvent(event);
        webhookSince=watermark;
      }
    } catch { /* regular connector polling remains available */ }
    if (Date.now() - lastStatus > 14000) {
      lastStatus = Date.now();
      const status = await request("status");
      $("liveDotLabel").textContent = status.running ? "LIVE" : "OFFLINE";
      $("liveDot").classList.toggle("on", status.running);
      document.querySelector(".stage").classList.toggle("connected", status.running);
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
// The preview is intentionally local-only: it never contacts the LIVE API or uses an auth token.
if (qp.get("preview") === "1") {
  $("unlock").hidden = true;
  $("liveDotLabel").textContent = "PREVIEW";
  $("liveDot").classList.add("preview");
  setConnection("Mode pratinjau · tidak terhubung ke TikTok LIVE");
  showCard({ nickname: "penonton_live", iso: "1996-11-16", via: "gift", giftName: "Rose" });
} else {
const fragment = new URLSearchParams(location.hash.replace(/^#/,""));
const fromFragment = fragment.get("access");
if (fromFragment) {
  history.replaceState(null,"",location.pathname+location.search);
  activate(fromFragment);
} else {
  const saved = sessionStorage.getItem("numerology_overlay_token");
  if (saved) activate(saved);
}
}

// Fetch public configuration without sending any admin key to the browser.
reloadSettings();
if (qp.get("preview") !== "1") setInterval(reloadSettings,30000);
