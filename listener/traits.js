'use strict';

// Arti singkat Angka Hidup untuk kartu overlay (judul + 3 kata kunci).
// Judul harus sama dengan interpretations.js di root (dijaga oleh tests/traits.test.js).
const TRAITS = {
  1: { title: 'Sang Pemimpin', keywords: ['Berani', 'Mandiri', 'Fokus'] },
  2: { title: 'Sang Penyeimbang', keywords: ['Empatik', 'Diplomatis', 'Kooperatif'] },
  3: { title: 'Sang Pengekspresi', keywords: ['Kreatif', 'Ekspresif', 'Optimis'] },
  4: { title: 'Sang Pembangun', keywords: ['Disiplin', 'Tekun', 'Andal'] },
  5: { title: 'Sang Penjelajah', keywords: ['Adaptif', 'Berani mencoba', 'Komunikatif'] },
  6: { title: 'Sang Pengasuh', keywords: ['Peduli', 'Bertanggung jawab', 'Suka membantu'] },
  7: { title: 'Sang Pencari Makna', keywords: ['Analitis', 'Reflektif', 'Intuitif'] },
  8: { title: 'Sang Pengelola', keywords: ['Berorientasi hasil', 'Percaya diri', 'Pengelola'] },
  9: { title: 'Sang Pemberi', keywords: ['Berjiwa besar', 'Idealis', 'Empatik'] },
  11: { title: 'Sang Intuitif', keywords: ['Intuitif', 'Visioner', 'Peka'] },
  22: { title: 'Sang Arsitek', keywords: ['Visioner', 'Praktis', 'Disiplin'] },
  33: { title: 'Sang Penyembuh', keywords: ['Empatik', 'Mengayomi', 'Berdedikasi'] },
};

function getTraits(n) {
  const t = TRAITS[n];
  if (!t) return null;
  return { title: t.title, keywords: t.keywords.slice(), master: n === 11 || n === 22 || n === 33 };
}

module.exports = { TRAITS, getTraits };
