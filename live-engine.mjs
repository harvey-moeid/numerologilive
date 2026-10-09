// Date-of-birth parsing stays local to OBS. Never infer an uncertain date.
const MONTHS = Object.freeze({
  jan:1,januari:1,january:1,feb:2,februari:2,february:2,mar:3,maret:3,march:3,
  apr:4,april:4,mei:5,may:5,jun:6,juni:6,jul:7,juli:7,july:7,
  agu:8,agt:8,agustus:8,aug:8,august:8,sep:9,september:9,
  okt:10,oct:10,oktober:10,october:10,nov:11,november:11,
  des:12,dec:12,desember:12,december:12
});
const pad = n => String(n).padStart(2,"0");
const isoOf = (day,month,year) => year + "-" + pad(month) + "-" + pad(day);
const birthdayCue = /\b(?:lahir|ttl|dob|ultah|birthday|birthdate|tanggal|tgl)\b|(?:^|\W)(?:tgl|tanggal)(?=\d{6}\b)/;
const dateLike = /(?<!\d)\d{1,2}\s*[\/.-]\s*\d{1,2}(?!\d)|(?<!\d)\d{1,2}\s+(?:jan|feb|mar|apr|mei|may|jun|jul|agu|agt|aug|sep|okt|oct|nov|des)[a-z]*\b|(?<!\d)\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}(?!\d)|(?<!\d)\d{8}(?!\d)/;
function fullYear(raw,currentYear,autoCorrect) {
  if (raw.length === 4) return Number(raw);
  if (!autoCorrect) return null;
  const short = Number(raw);
  return short <= currentYear % 100 ? 2000 + short : 1900 + short;
}
function realDate(day,month,year,today) {
  if (!Number.isInteger(year) || year < 1900 || year > today.getFullYear() ||
      month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year,month-1,day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month-1 ||
      date.getUTCDate() !== day) return null;
  const iso = isoOf(day,month,year);
  return iso <= isoOf(today.getDate(),today.getMonth()+1,today.getFullYear()) ? iso : null;
}

/** status: valid (ISO date), invalid (date-like but uncertain), none (ordinary chat). */
export function parseDob(message,now=new Date(),{mode="flexible",autoCorrect=true}={}) {
  const text = String(message || "").normalize("NFKC").toLowerCase().slice(0,300);
  if (!text.trim()) return {status:"none"};
  const matches = [];
  let complete = false;
  function scan(pattern,parts) {
    let found;
    while ((found = pattern.exec(text))) {
      complete = true;
      const [d,m,y] = parts(found);
      const year = fullYear(String(y),now.getFullYear(),autoCorrect);
      const iso = year === null ? null : realDate(Number(d),Number(m),year,now);
      if (iso) matches.push(iso);
    }
  }
  if (mode === "strict") {
    scan(/(?<!\d)(\d{2})\/(\d{2})\/(\d{4})(?!\d)/g,m=>[m[1],m[2],m[3]]);
  } else {
    scan(/(?<!\d)(\d{1,2})\s*[\/\-. ]\s*(\d{1,2})\s*[\/\-. ]\s*(\d{4}|\d{2})(?!\d)/g,m=>[m[1],m[2],m[3]]);
    scan(/(?<!\d)(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\d)/g,m=>[m[3],m[2],m[1]]);
    scan(/(?<!\d)(\d{1,2})\s*[-\/., ]\s*([a-z]{3,10})\.?\s*[-\/.,' ]*\s*(\d{4}|\d{2})(?!\d)/g,
      m=>[m[1],MONTHS[m[2]]||0,m[3]]);
    scan(/(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/g,m=>[m[1],m[2],m[3]]);
    scan(/\b(?:tgl|tanggal)\.?\s*[:=]?\s*(\d{1,2})\s*[,./-]?\s*(?:bln|bulan)\.?\s*[:=]?\s*(\d{1,2})\s*[,./-]?\s*(?:thn|tahun)\.?\s*[:=]?\s*(\d{4}|\d{2})(?!\d)/g,m=>[m[1],m[2],m[3]]);
    if (autoCorrect && birthdayCue.test(text))
      scan(/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/g,m=>[m[1],m[2],m[3]]);
  }
  const unique = [...new Set(matches)];
  if (unique.length === 1) return {status:"valid",iso:unique[0]};
  if (unique.length > 1) return {status:"invalid",reason:"ambiguous"};
  if (complete || birthdayCue.test(text) || dateLike.test(text)) return {status:"invalid",reason:"format"};
  return {status:"none"};
}
// Backward compatibility for existing consumers.
export function extractDob(message,now=new Date(),options) {
  return parseDob(message,now,options).iso || null;
}
const usernameOf = x => String(x?.username || "").replace(/^@/,"").trim().toLowerCase().slice(0,64);

export class LiveEngine {
  constructor({likeThreshold=400,giftMinimum=1,now=()=>new Date(),
    dobMode="flexible",dobAutoCorrect=true,dobErrorNotices=true,
    dobNoticeCooldownSeconds=45}={}) {
    this.likeThreshold=Math.max(1,Math.floor(Number(likeThreshold)||400));
    this.giftMinimum=Math.max(1,Math.floor(Number(giftMinimum)||1));
    this.now=now;
    this.dobMode=dobMode;
    this.dobAutoCorrect=dobAutoCorrect;
    this.dobErrorNotices=dobErrorNotices;
    this.dobNoticeCooldownSeconds=dobNoticeCooldownSeconds;
    this.seen=new Set(); this.pending=new Map(); this.likes=new Map();
    this.invalidNotified=new Map(); this.lastInvalidNoticeAt=-Infinity; this.roomId=null;
  }
  reset() {
    this.pending.clear(); this.likes.clear(); this.invalidNotified.clear();
    this.lastInvalidNoticeAt=-Infinity;
  }
  markSeen(event) {
    if (!event || typeof event.id!=="string" || !event.id) return false;
    if (this.seen.has(event.id)) return false;
    this.seen.add(event.id);
    if (this.seen.size>800) this.seen.delete(this.seen.values().next().value);
    return true;
  }
  handle(event) {
    if (!this.markSeen(event)) return null;
    if (event.event==="stream") {
      if (event.data?.state==="started" || event.data?.state==="ended") this.reset();
      this.roomId=event.data?.state==="ended"?null:event.roomId||this.roomId;
      return null;
    }
    if (event.roomId && this.roomId && event.roomId!==this.roomId) this.reset();
    if (event.roomId) this.roomId=event.roomId;
    const data=event.data||{};
    const username=usernameOf(data);
    if (!username) return null;
    const now=this.now(), moment=now.getTime();
    const old=this.pending.get(username);
    if (old && moment-old.at>30*60_000) this.pending.delete(username);
    const nickname=String(data.nickname||data.username).slice(0,50);

    if (event.event==="chat") {
      const parsed=parseDob(data.message,now,{mode:this.dobMode,autoCorrect:this.dobAutoCorrect});
      if (parsed.status==="none") return null;
      if (parsed.status==="valid") {
        const existing=this.pending.get(username);
        if (existing?.iso===parsed.iso && moment-existing.at<30_000) return null;
        this.pending.set(username,{iso:parsed.iso,at:moment,nickname});
        if (this.pending.size>400) this.pending.delete(this.pending.keys().next().value);
        return {type:"pending",username,nickname};
      }
      // A malformed correction cannot leave an old DOB eligible for gift/like.
      this.pending.delete(username);
      if (!this.dobErrorNotices) return null;
      const last=this.invalidNotified.get(username);
      const cooldown=Math.max(10,Number(this.dobNoticeCooldownSeconds)||45)*1000;
      if ((last!==undefined && moment-last<cooldown) || moment-this.lastInvalidNoticeAt<4000) return null;
      this.invalidNotified.set(username,moment);
      if (this.invalidNotified.size>400) this.invalidNotified.delete(this.invalidNotified.keys().next().value);
      this.lastInvalidNoticeAt=moment;
      return {type:"invalid",username,nickname,reason:parsed.reason};
    }
    const pending=this.pending.get(username);
    if (event.event==="like") {
      const count=Math.max(0,Number(data.likeCount)||0);
      const previous=this.likes.get(username)||0;
      const next=previous+count;
      this.likes.set(username,next);
      if (this.likes.size>800) this.likes.delete(this.likes.keys().next().value);
      if (!pending || Math.floor(next/this.likeThreshold)<=Math.floor(previous/this.likeThreshold)) return null;
      return {type:"result",username,nickname:pending.nickname,iso:pending.iso,via:"like",amount:this.likeThreshold};
    }
    if (event.event==="gift") {
      if ((data.streakable===true||Number(data.giftType)===1) && data.repeatEnd!==true) return null;
      const repeats=Math.max(1,Number(data.repeatCount)||1);
      const coins=Number(data.totalValue)>0?Number(data.totalValue):(Number(data.diamondCount)||0)*repeats;
      if (!pending||coins<this.giftMinimum) return null;
      return {type:"result",username,nickname:pending.nickname,iso:pending.iso,
        via:"gift",giftName:String(data.giftName||"Gift").slice(0,80),amount:coins};
    }
    return null;
  }
}
