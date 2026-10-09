// Public status shows only aggregate LIVE information. No API keys or comment content.
const banner = document.getElementById("liveNow");
const account = document.getElementById("liveAccount");
async function refreshLiveStatus() {
  try {
    const response = await fetch("/api/tiktok/status", {cache:"no-store"});
    if (!response.ok) throw Error("Unavailable");
    const status = await response.json();
    if (!status.running) { banner.classList.add("hidden"); return; }
    account.textContent = status.username ? "Siarkan bersama @" + status.username : "Live sedang aktif";
    banner.classList.remove("hidden");
  } catch { banner.classList.add("hidden"); }
}
refreshLiveStatus();
setInterval(refreshLiveStatus,30000);
