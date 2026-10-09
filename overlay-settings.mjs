// Shared, non-secret schema for admin settings and the public OBS overlay.
export const CONTEXT_LABELS = Object.freeze({
  general: "Gambaran umum",
  love: "Cinta & hubungan",
  career: "Karier & pekerjaan",
  strengths: "Kekuatan diri",
  challenges: "Tantangan",
  advice: "Saran refleksi"
});
export const DEFAULT_SETTINGS = Object.freeze({
  siteName: "JALUR NUMEROLOGY",
  idleTitle: "Temukan Angka Hidupmu",
  idleIntro: "Setiap tanggal punya kisah. Temukan makna di balik angka kehidupanmu melalui LIVE ini.",
  footerNote: "Numerologi untuk hiburan & refleksi pribadi",
  contexts: ["general"],
  likesEnabled: true,
  giftsEnabled: true,
  likeThreshold: 400,
  giftMinimum: 1,
  durationSeconds: 13,
  showBrand: true,
  showUsername: true,
  showNumber: true,
  showTitle: true,
  showReason: true,
  showDisclaimer: true,
  showInstructions: true
});
const cleanText = (value, fallback, maximum) =>
  typeof value === "string" ? value.replace(/[\x00-\x1F\x7F]/g," ").trim().slice(0, maximum) || fallback : fallback;
const positiveInt = (value, fallback, maximum) =>
  Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : fallback;
export function normalizeSettings(value = {}) {
  const x = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const contexts = Array.isArray(x.contexts)
    ? [...new Set(x.contexts.filter(k => typeof k === "string" && Object.hasOwn(CONTEXT_LABELS, k)))].slice(0, 6)
    : DEFAULT_SETTINGS.contexts;
  const settings = {
    siteName: cleanText(x.siteName, DEFAULT_SETTINGS.siteName, 50),
    idleTitle: cleanText(x.idleTitle, DEFAULT_SETTINGS.idleTitle, 90),
    idleIntro: cleanText(x.idleIntro, DEFAULT_SETTINGS.idleIntro, 300),
    footerNote: cleanText(x.footerNote, DEFAULT_SETTINGS.footerNote, 130),
    contexts: contexts.length ? contexts : [...DEFAULT_SETTINGS.contexts],
    likesEnabled: typeof x.likesEnabled === "boolean" ? x.likesEnabled : DEFAULT_SETTINGS.likesEnabled,
    giftsEnabled: typeof x.giftsEnabled === "boolean" ? x.giftsEnabled : DEFAULT_SETTINGS.giftsEnabled,
    likeThreshold: positiveInt(x.likeThreshold, DEFAULT_SETTINGS.likeThreshold, 100000),
    giftMinimum: positiveInt(x.giftMinimum, DEFAULT_SETTINGS.giftMinimum, 100000),
    durationSeconds: positiveInt(x.durationSeconds, DEFAULT_SETTINGS.durationSeconds, 120)
  };
  for (const k of ["showBrand","showUsername","showNumber","showTitle","showReason","showDisclaimer","showInstructions"]) {
    settings[k] = typeof x[k] === "boolean" ? x[k] : DEFAULT_SETTINGS[k];
  }
  // Disable neither trigger, otherwise a viewer could never unlock a reading.
  if (!settings.likesEnabled && !settings.giftsEnabled) settings.giftsEnabled = true;
  return settings;
}
export function formatReading(info, selected = DEFAULT_SETTINGS.contexts) {
  if (!info) return "";
  const content = {
    general: info.summary,
    love: info.relationships,
    career: info.career,
    strengths: (info.strengths || []).join(" · "),
    challenges: (info.challenges || []).join(" · "),
    advice: (info.advice || []).join(" · ")
  };
  const contexts = selected.filter(k => Object.hasOwn(CONTEXT_LABELS,k));
  const parts = contexts.map(k => {
    const body = String(content[k] || "").trim();
    return body ? (contexts.length > 1 ? CONTEXT_LABELS[k] + ": " : "") + body : "";
  }).filter(Boolean);
  return parts.join("\n\n") || String(info.summary || "");
}
