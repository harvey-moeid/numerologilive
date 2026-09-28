// Tes toggle ON/OFF listener dengan konektor TikTok palsu (tanpa jaringan).
// Jalankan: cd listener && npm install && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');
const EventEmitter = require('events');

const PORT = 39123;
process.env.TIKTOK_USERNAME = 'tester';
process.env.ADMIN_TOKEN = 'tok';
process.env.PORT = String(PORT);

const fake = { instances: [], delay: 100, failNext: false };
class FakeConn extends EventEmitter {
  constructor() { super(); this.disconnected = 0; fake.instances.push(this); }
  connect() {
    const n = fake.instances.length;
    return new Promise((res, rej) => setTimeout(() => {
      if (fake.failNext) { fake.failNext = false; return rej(new Error('Failed to sign request')); }
      res({ roomId: 'R' + n });
    }, fake.delay));
  }
  disconnect() { this.disconnected++; }
}
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'tiktok-live-connector') return { WebcastPushConnection: FakeConn };
  return origLoad.call(this, request, ...rest);
};
require(path.join(__dirname, '..', 'server.js'));

const H = { 'x-admin-token': 'tok' };
const call = async (p, method = 'GET', headers = H) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method, headers });
  return { status: r.status, body: await r.json() };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(() => sleep(300));
test.after(() => setTimeout(() => process.exit(0), 50));
test.beforeEach(async () => { await call('/api/stop', 'POST'); fake.delay = 100; fake.failNext = false; });

test('API menolak tanpa token / token salah', async () => {
  assert.equal((await call('/api/status', 'GET', {})).status, 401);
  assert.equal((await call('/api/start', 'POST', { 'x-admin-token': 'salah' })).status, 401);
});

test('ON lalu OFF: connecting -> running -> off, dan disconnect() dipanggil', async () => {
  const r1 = await call('/api/start', 'POST');
  assert.equal(r1.body.connecting, true);
  assert.equal(r1.body.running, false);
  await sleep(250);
  const s = (await call('/api/status')).body;
  assert.equal(s.running, true);
  assert.ok(s.roomId);
  const conn = fake.instances[fake.instances.length - 1];
  const r2 = await call('/api/stop', 'POST');
  assert.equal(r2.body.running, false);
  assert.equal(conn.disconnected, 1);
});

test('OFF saat masih connecting membatalkan: tetap OFF dan koneksi yatim ditutup', async () => {
  fake.delay = 300;
  await call('/api/start', 'POST');
  await sleep(50);
  const conn = fake.instances[fake.instances.length - 1];
  const r = await call('/api/stop', 'POST');
  assert.equal(r.body.connecting, false);
  await sleep(500);
  const s = (await call('/api/status')).body;
  assert.equal(s.running, false, 'tidak boleh aktif lagi setelah dibatalkan');
  assert.equal(s.connecting, false);
  assert.ok(conn.disconnected >= 1, 'koneksi yatim harus di-disconnect');
});

test('koneksi putus -> status reconnecting; OFF membatalkan reconnect otomatis', async () => {
  await call('/api/start', 'POST');
  await sleep(250);
  const conn = fake.instances[fake.instances.length - 1];
  conn.emit('disconnected');
  const s = (await call('/api/status')).body;
  assert.equal(s.reconnecting, true);
  assert.equal(s.running, false);
  const before = fake.instances.length;
  const r = await call('/api/stop', 'POST');
  assert.equal(r.body.reconnecting, false);
  await sleep(5600);
  assert.equal(fake.instances.length, before, 'tidak boleh ada reconnect setelah OFF');
  assert.equal((await call('/api/status')).body.running, false);
});

test('gagal konek: kembali OFF dengan lastError', async () => {
  fake.failNext = true;
  await call('/api/start', 'POST');
  await sleep(250);
  const s = (await call('/api/status')).body;
  assert.equal(s.running, false);
  assert.equal(s.connecting, false);
  assert.match(s.lastError, /sign request/);
});
