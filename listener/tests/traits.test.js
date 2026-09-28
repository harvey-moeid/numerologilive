// Tes arti singkat (judul + kata kunci) untuk kartu overlay.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TRAITS, getTraits } = require('../traits');

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

test('semua Angka Hidup punya judul dan 3 kata kunci', () => {
  for (const n of NUMBERS) {
    const t = getTraits(n);
    assert.ok(t, `angka ${n} harus punya traits`);
    assert.ok(t.title.length > 0);
    assert.equal(t.keywords.length, 3, `angka ${n} harus punya 3 kata kunci`);
  }
  assert.equal(getTraits(10), null);
  assert.equal(getTraits(11).master, true);
  assert.equal(getTraits(4).master, false);
});

// Jaga agar judul di overlay tidak menyimpang dari tafsiran situs utama.
const rootInterp = path.join(__dirname, '..', '..', 'interpretations.js');
test('judul sama dengan interpretations.js di root', { skip: !fs.existsSync(rootInterp) }, () => {
  const { INTERP } = require(rootInterp);
  for (const n of NUMBERS) {
    const expected = INTERP[n].title.replace(/\s*\(.*\)\s*$/, '');
    assert.equal(TRAITS[n].title, expected, `judul angka ${n} harus sama`);
  }
});
