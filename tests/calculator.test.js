const test = require('node:test');
const assert = require('node:assert/strict');
const {
  digitSum,
  reduceNumber,
  calculateLifePath,
  calculatePyramid,
  validateDob
} = require('../calculator.js');

test('digitSum sums digits of a numeric string', () => {
  assert.equal(digitSum('1990'), 19);
  assert.equal(digitSum('0'), 0);
  assert.equal(digitSum('15'), 6);
});

test('reduceNumber reduces to single digit when keepMaster is false', () => {
  assert.equal(reduceNumber(19, false), 1);
  assert.equal(reduceNumber(9, false), 9);
  assert.equal(reduceNumber(11, false), 2);
});

test('reduceNumber preserves master numbers 11, 22, 33 when keepMaster is true', () => {
  assert.equal(reduceNumber(11, true), 11);
  assert.equal(reduceNumber(22, true), 22);
  assert.equal(reduceNumber(33, true), 33);
  assert.equal(reduceNumber(29, true), 11); // digitSum(29) = 11 -> master, stays 11
});

test('calculateLifePath computes correct life path number', () => {
  // 15-06-1990: digitSum(15)=6, digitSum(6)=6, digitSum(1990)=19 -> total=31 -> reduce=4
  assert.equal(calculateLifePath(15, 6, 1990), 4);
});

test('calculateLifePath preserves master numbers', () => {
  // day=29, month=11, year=1975: digitSum(29)=11, digitSum(11)=2, digitSum(1975)=22
  // total = 11+2+22 = 35 -> reduce(35,true): digitSum(35)=8 -> 8 (sanity check, not master)
  assert.equal(calculateLifePath(29, 11, 1975), 8);
});

test('calculatePyramid computes cells, rows, apex and derived values', () => {
  const result = calculatePyramid('1990-06-15');
  assert.deepEqual(result.cells, ['15', '06', '19', '90']);
  assert.deepEqual(result.row1, [6, 6, 1, 9]);
  assert.deepEqual(result.row2, [3, 1]);
  assert.equal(result.apex, 4);
  assert.equal(result.jiwa, 3);
  assert.equal(result.hati, 1);
  assert.equal(result.karisma, 6);
  assert.equal(result.tantangan, 4);
});

test('validateDob rejects empty input', () => {
  const res = validateDob('', '2026-09-26');
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'empty');
});

test('validateDob rejects invalid date string', () => {
  const res = validateDob('not-a-date', '2026-09-26');
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'invalid');
});

test('validateDob rejects future dates', () => {
  const res = validateDob('2099-01-01', '2026-09-26');
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'future');
});

test('validateDob rejects dates before 1900', () => {
  const res = validateDob('1899-12-31', '2026-09-26');
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'out_of_range');
});

test('validateDob accepts a valid date', () => {
  const res = validateDob('1990-06-15', '2026-09-26');
  assert.equal(res.valid, true);
});

test('validateDob rejects calendar dates that do not exist', () => {
  for (const iso of ['1995-02-30', '1995-02-31', '1995-04-31', '1995-06-31', '1995-02-29', '1900-02-29', '1995-13-01', '1995-00-10', '1995-01-00']) {
    const res = validateDob(iso, '2026-09-26');
    assert.equal(res.valid, false, iso + ' seharusnya ditolak');
    assert.equal(res.reason, 'invalid', iso);
  }
});

test('validateDob accepts real edge dates (leap day, month ends)', () => {
  for (const iso of ['2000-02-29', '1996-02-29', '1995-02-28', '1995-01-31', '1995-04-30', '1900-01-01']) {
    assert.equal(validateDob(iso, '2026-09-26').valid, true, iso + ' seharusnya valid');
  }
});

test('validateDob rejects malformed ISO formats', () => {
  for (const iso of ['1995-2-3', '95-02-03', '1995/02/03', '1995-02-03T00:00:00', ' 1995-02-03']) {
    assert.equal(validateDob(iso, '2026-09-26').reason, 'invalid', iso);
  }
});

