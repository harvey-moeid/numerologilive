'use strict';

// Parser tanggal lahir dari komen penonton.
// Mendukung: 25/01/1994, 25-1-1994, 25.01.1994, 25 01 1994, 25/01/94, 25 Januari 1994,
// 25 jan 94, 25jan1994, 5 Agt 2001, January 25, 1994, dan 25011994.
// Kandidat pertama (urut kemunculan) yang lolos validasi yang dipakai.

const MONTHS = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

// Tahun 2 digit: anggap penonton minimal 13 tahun (batas usia TikTok).
// Contoh (2026): 05 -> 2005, 13 -> 2013, 14 -> 1914? tidak; 14+ -> 19xx (mis. 94 -> 1994).
function expandYear(yy, nowYear) {
  const threshold = (nowYear - 13) % 100;
  return yy <= threshold ? 2000 + yy : 1900 + yy;
}

function toIso(d, m, y) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function collectCandidates(text, nowYear) {
  const out = [];
  let m;
  const push = (index, d, mo, y) => out.push({ index, d, m: mo, y });

  // 1) d/m/yyyy dengan pemisah / - . atau spasi
  const p1 = /(?<!\d)(\d{1,2})\s?[\/\-. ]\s?(\d{1,2})\s?[\/\-. ]\s?(\d{4})(?!\d)/g;
  while ((m = p1.exec(text)) !== null) push(m.index, +m[1], +m[2], +m[3]);

  // 2) d/m/yy hanya dengan pemisah / atau - yang sama (hindari salah tangkap angka biasa)
  const p2 = /(?<![\d.\/\-])(\d{1,2})([\/\-])(\d{1,2})\2(\d{2})(?!\d)/g;
  while ((m = p2.exec(text)) !== null) push(m.index, +m[1], +m[3], expandYear(+m[4], nowYear));

  // 3) tanggal + nama bulan + tahun: "25 januari 1994", "25 jan 94", "25jan1994"
  const p3 = /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s*[\-\/. ]?\s*([a-z]{3,9})\.?\s*[\-\/.,' ]?\s*(\d{4}|\d{2})(?!\d)/g;
  while ((m = p3.exec(text)) !== null) {
    const mo = MONTHS[m[2]];
    if (!mo) continue;
    const y = m[3].length === 4 ? +m[3] : expandYear(+m[3], nowYear);
    push(m.index, +m[1], mo, y);
  }

  // 4) urutan Inggris: "january 25, 1994"
  const p4 = /(?<![a-z])([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/g;
  while ((m = p4.exec(text)) !== null) {
    const mo = MONTHS[m[1]];
    if (!mo) continue;
    push(m.index, +m[2], mo, +m[3]);
  }

  // 5) ddmmyyyy tanpa pemisah: "25011994"
  const p5 = /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/g;
  while ((m = p5.exec(text)) !== null) push(m.index, +m[1], +m[2], +m[3]);

  return out;
}

// validate(iso) -> { valid: boolean }. Mengembalikan { iso, d, m, y } atau null.
function extractDob(input, validate, now = new Date()) {
  if (!input) return null;
  const text = String(input).toLowerCase().slice(0, 300);
  const candidates = collectCandidates(text, now.getFullYear()).sort((a, b) => a.index - b.index);
  for (const c of candidates) {
    if (!(c.d >= 1 && c.d <= 31 && c.m >= 1 && c.m <= 12)) continue;
    const iso = toIso(c.d, c.m, c.y);
    const check = validate ? validate(iso) : { valid: true };
    if (check && check.valid) return { iso, d: c.d, m: c.m, y: c.y };
  }
  return null;
}

module.exports = { extractDob, expandYear, MONTHS };
