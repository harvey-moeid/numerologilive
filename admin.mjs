import { DEFAULT_SETTINGS, CONTEXT_LABELS, normalizeSettings } from "/overlay-settings.mjs";
import { parseDob } from "/live-engine.mjs";
const $ = id => document.getElementById(id);
let adminToken = "";
const keys = ["siteName","idleTitle","idleIntro","footerNote","likeThreshold","giftMinimum","durationSeconds","dobNoticeCooldownSeconds","dobHelpText"];
const toggles = ["likesEnabled","giftsEnabled","showBrand","showUsername","showNumber","showTitle","showReason","showDisclaimer","showInstructions","dobAutoCorrect","dobErrorNotices"];
const message = (id, text) => { $(id).textContent=text; };
const selected = () => [...document.querySelectorAll('input[name="contexts"]:checked')].map(x=>x.value);
function render(form) {
  const s=normalizeSettings(form);
  for (const k of keys) $(k).value=s[k];
  for (const k of toggles) $(k).checked=s[k];
  $("dobMode").value=s.dobMode;
  document.querySelectorAll('input[name="contexts"]').forEach(el=>el.checked=s.contexts.includes(el.value));
  updatePreview();
}
function gather() {
  const data={contexts:selected()};
  for(const k of keys) data[k] = ["likeThreshold","giftMinimum","durationSeconds","dobNoticeCooldownSeconds"].includes(k) ? Number($(k).value) : $(k).value;
  for(const k of toggles) data[k]=$(k).checked;
  data.dobMode=$("dobMode").value;
  return data;
}
function updatePreview() {
  const x=gather();
  $("mockBrand").textContent=x.siteName;
  $("mockTitle").textContent=x.idleTitle;
  $("mockIntro").textContent=x.idleIntro;
  $("mockParser").textContent=x.dobMode==="strict"?"Format ketat · DD/MM/YYYY":
    "Format fleksibel · "+(x.dobAutoCorrect?"Koreksi tahun aktif":"Hanya tahun lengkap");
  $("mockTrigger").textContent=(x.giftsEnabled?"Gift ≥ "+x.giftMinimum+" koin":"")+(x.likesEnabled?(x.giftsEnabled?" atau ":"")+x.likeThreshold+" like":"");
  $("mockContexts").textContent="Konteks: "+(x.contexts.map(k=>CONTEXT_LABELS[k]).filter(Boolean).join(", ")||"belum dipilih");
  $("mockBrand").hidden=!x.showBrand;
  document.querySelector(".mock strong").hidden=!x.showNumber;
  document.querySelector(".mockLabel").hidden=!x.showTitle;
}
async function api(method="GET",body) {
  const response=await fetch("/api/admin/settings",{method,cache:"no-store",headers:{
    Authorization:"Bearer "+adminToken,
    ...(method==="PUT"?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({error:"Respons server tidak valid"}));
  if(!response.ok)throw Error(data.error||"HTTP "+response.status);
  return data;
}
async function checkLive() {
  try{
    const response=await fetch("/api/tiktok/status",{cache:"no-store"});
    const data=await response.json();
    $("statusDot").classList.toggle("on",data.running===true);
    $("liveStatus").textContent=data.running?"LIVE @"+(data.username||"TikTok"):"Konektor "+(response.ok?"OFFLINE":"belum siap");
  }catch{ $("liveStatus").textContent="Status konektor tidak tersedia";$("statusDot").classList.remove("on");}
}
$("authForm").addEventListener("submit",async event=>{
  event.preventDefault();
  adminToken=$("adminToken").value.trim();
  $("connectAdmin").disabled=true;
  message("authStatus","Memeriksa kredensial…");
  try{
    const {settings}=await api();
    render(settings);
    $("auth").hidden=true;$("panel").hidden=false;
    $("adminToken").value="";
    message("authStatus","");
    checkLive();
  }catch(error){message("authStatus",error.message);adminToken="";}
  finally{$("connectAdmin").disabled=false;}
});
$("settingsForm").addEventListener("input",updatePreview);
$("settingsForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const data=gather();
  if(!data.contexts.length){message("saveStatus","Pilih minimal satu konteks pembacaan.");return;}
  if(!data.likesEnabled&&!data.giftsEnabled){message("saveStatus","Aktifkan gift atau like, minimal salah satu.");return;}
  $("save").disabled=true;message("saveStatus","Menyimpan pengaturan…");
  try{
    const response=await api("PUT",data);
    render(response.settings);
    message("saveStatus","Tersimpan di R2. Overlay akan mengambil pengaturan baru secara otomatis (maksimal sekitar 30 detik).");
  }catch(error){message("saveStatus","Gagal menyimpan: "+error.message);}
  finally{$("save").disabled=false;}
});
$("reset").addEventListener("click",()=>{render(DEFAULT_SETTINGS);message("saveStatus","Default sudah dimuat. Klik Simpan untuk menerapkannya ke overlay.");});
$("logout").addEventListener("click",()=>{adminToken="";$("panel").hidden=true;$("auth").hidden=false;message("saveStatus","");});
$("checkLive").addEventListener("click",checkLive);

$("dobTestButton").addEventListener("click",()=>{
  const x=gather();
  const result=parseDob($("dobTestInput").value,new Date(),{
    mode:x.dobMode,autoCorrect:x.dobAutoCorrect
  });
  $("dobTestResult").textContent=result.status==="valid"
    ?"✓ Terbaca: "+result.iso+" · menunggu gift/like dari akun yang sama."
    :result.status==="invalid"
      ?"⚠ Tanggal tidak valid atau belum lengkap. "+(result.reason==="ambiguous"?"Kirim satu tanggal saja.":"Coba format DD/MM/YYYY.")
      :"Komentar biasa: diabaikan. Coba tulis tanggal lahir.";
});
