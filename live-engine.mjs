// Client-only state for one OBS overlay session. Date-of-birth comments are never persisted.
const MONTHS = {jan:1,januari:1,january:1,feb:2,februari:2,february:2,mar:3,maret:3,march:3,
apr:4,april:4,mei:5,may:5,jun:6,juni:6,jun:6,juli:7,jul:7,july:7,
agu:8,agt:8,agustus:8,aug:8,august:8,sep:9,september:9,okt:10,oct:10,oktober:10,
nov:11,november:11,des:12,dec:12,desember:12,december:12};
const pad = n => String(n).padStart(2, "0");
const isoOf = (day, month, year) => year + "-" + pad(month) + "-" + pad(day);
export function extractDob(message, now = new Date()) {
  const text = String(message || "").toLowerCase().slice(0, 300);
  const candidates = [];
  let match;
  const add = (m, d, mon, y) => candidates.push({ index: m.index, iso: isoOf(Number(d), Number(mon), Number(y)) });
  const numeric = /(?<!\d)(\d{1,2})\s*[\/\-. ]\s*(\d{1,2})\s*[\/\-. ]\s*(\d{4})(?!\d)/g;
  while ((match = numeric.exec(text))) add(match, match[1], match[2], match[3]);
  const months = /(?<!\d)(\d{1,2})\s*[\-\/. ]?\s*([a-z]{3,9})\.?\s*[\-\/.,' ]?\s*(\d{4})(?!\d)/g;
  while ((match = months.exec(text))) if (MONTHS[match[2]]) add(match, match[1], MONTHS[match[2]], match[3]);
  const compact = /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/g;
  while ((match = compact.exec(text))) add(match, match[1], match[2], match[3]);
  candidates.sort((a,b) => a.index - b.index);
  for (const entry of candidates) {
    const iso = entry.iso;
    const [y,m,d] = iso.split("-").map(Number);
    if (y < 1900 || y > now.getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) continue;
    const dt = new Date(Date.UTC(y,m-1,d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m-1 || dt.getUTCDate() !== d) continue;
    if (iso > now.toISOString().slice(0,10)) continue;
    return iso;
  }
  return null;
}
const usernameOf = x => String(x?.username || "").replace(/^@/, "").trim().toLowerCase().slice(0, 64);

export class LiveEngine {
  constructor({ likeThreshold=400, giftMinimum=1, now=()=>new Date() } = {}) {
    this.likeThreshold = Math.max(1, Math.floor(Number(likeThreshold) || 400));
    this.giftMinimum = Math.max(1, Math.floor(Number(giftMinimum) || 1));
    this.now = now;
    this.seen = new Set(); this.pending = new Map(); this.likes = new Map(); this.roomId = null;
  }
  reset() { this.pending.clear(); this.likes.clear(); }
  markSeen(event) {
    if (!event || typeof event.id !== "string" || !event.id) return false;
    if (this.seen.has(event.id)) return false;
    this.seen.add(event.id);
    if (this.seen.size > 800) this.seen.delete(this.seen.values().next().value);
    return true;
  }
  handle(event) {
    if (!this.markSeen(event)) return null;
    if (event.event === "stream") {
      if (event.data?.state === "started" || event.data?.state === "ended") this.reset();
      this.roomId = event.data?.state === "ended" ? null : event.roomId || this.roomId;
      return null;
    }
    if (event.roomId && this.roomId && event.roomId !== this.roomId) this.reset();
    if (event.roomId) this.roomId = event.roomId;
    const data = event.data || {};
    const username = usernameOf(data);
    if (!username) return null;
    const now = this.now();
    const stored = this.pending.get(username);
    if (stored && now.getTime() - stored.at > 30 * 60_000) this.pending.delete(username);
    if (event.event === "chat") {
      const iso = extractDob(data.message, now);
      if (!iso) return null;
      this.pending.set(username, { iso, at: now.getTime(), nickname: String(data.nickname || data.username).slice(0, 50) });
      if (this.pending.size > 400) this.pending.delete(this.pending.keys().next().value);
      return { type: "pending", username, nickname: String(data.nickname || data.username).slice(0,50) };
    }
    const pending = this.pending.get(username);
    if (event.event === "like") {
      const count = Math.max(0, Number(data.likeCount) || 0);
      const previous = this.likes.get(username) || 0;
      const next = previous + count;
      this.likes.set(username, next);
      if (this.likes.size > 800) this.likes.delete(this.likes.keys().next().value);
      if (!pending || Math.floor(next / this.likeThreshold) <= Math.floor(previous / this.likeThreshold)) return null;
      return { type: "result", username, nickname: pending.nickname, iso: pending.iso, via: "like", amount: this.likeThreshold };
    }
    if (event.event === "gift") {
      // A streak gift should only count at its final event.
      if ((data.streakable === true || Number(data.giftType) === 1) && data.repeatEnd !== true) return null;
      const repeats = Math.max(1, Number(data.repeatCount) || 1);
      const coins = Number(data.totalValue) > 0 ? Number(data.totalValue) : (Number(data.diamondCount) || 0) * repeats;
      if (!pending || coins < this.giftMinimum) return null;
      return { type: "result", username, nickname: pending.nickname, iso: pending.iso,
        via: "gift", giftName: String(data.giftName || "Gift").slice(0,80), amount: coins };
    }
    return null;
  }
}
