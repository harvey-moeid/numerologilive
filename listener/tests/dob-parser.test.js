// Tes parser tanggal lahir dari komen (tanpa jaringan).
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDob } = require('../dob-parser');
const { validateDob } = require('../calculator');

const todayISO = new Date().toISOString().slice(0, 10);
const parse = (text) => extractDob(text, (iso) => validateDob(iso, todayISO));

const valid = [
  ['25/01/1994', '1994-01-25'],
  ['25-1-1994', '1994-01-25'],
  ['25.01.1994', '1994-01-25'],
  ['25 01 1994', '1994-01-25'],
  ['tgl lahir 25/01/1994 ya kak', '1994-01-25'],
  ['25/01/94', '1994-01-25'],
  ['10/05/05', '2005-05-10'],
  ['25 Januari 1994', '1994-01-25'],
  ['lahir 25 januari 1994 kak', '1994-01-25'],
  ['25 jan 94', '1994-01-25'],
  ['25jan1994', '1994-01-25'],
  ['5 Agt 2001', '2001-08-05'],
  ['17 agustus 1999', '1999-08-17'],
  ['1 Des 1988', '1988-12-01'],
  ['January 25, 1994', '1994-01-25'],
  ['25011994', '1994-01-25'],
  ['31/02/1994 eh salah, 28/02/1994', '1994-02-28'],
];
for (const [text, iso] of valid) {
  test(`parse "${text}" -> ${iso}`, () => {
    const r = parse(text);
    assert.ok(r, 'harus terbaca');
    assert.equal(r.iso, iso);
  });
}

const invalid = [
  'halo kak',
  'aku 3 orang',
  'saya 12 dan 2000 hari',
  '30/02/1994',
  '31 Februari 1994',
  '31/12/2999',
  '',
];
for (const text of invalid) {
  test(`tidak terbaca: "${text}"`, () => {
    assert.equal(parse(text), null);
  });
}
