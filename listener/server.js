try { require('dotenv/config'); } catch (_) { /* dotenv opsional untuk lokal; Render inject env langsung */ }

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { calculateLifePath, calculatePyramid, validateDob } = require('./calculator');

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const PORT = process.env.PORT || 3000;

const GIFT_MIN_COINS = parseInt(process.env.GIFT_MIN_COINS || '1', 10);
const LIKE_THRESHOLD = parseInt(process.env.LIKE_THRESHOLD || '400', 10);
const SIGN_API_KEY = process.env.SIGN_API_KEY || '';

// Reconnect otomatis: jeda awal, dobel tiap gagal, maksimum RECONNECT_MAX_MS.
const RECONNECT_BASE_MS = parseInt(process.env.RECONNECT_BASE_MS || '5000', 10);
const RECONNECT_MAX_MS = parseInt(process.env.RECONNECT_MAX_MS || '60000', 10);

// Data penonton (tanggal lahir dari komen) hanya disimpan sementara di memori.
const DOB_TTL_MS = parseInt(process.env.DOB_TTL_MS || String(6 * 60 * 60 * 1000), 10);
const CACHE_MAX_ENTRIES = 20000;
const CALC_COOLDOWN_MS = 3000;

// Pembatasan percobaan token admin yang salah (per IP).
const ADMIN_MAX_FAILS = parseInt(process.env.ADMIN_MAX_FAILS || '10', 10);
const ADMIN_FAIL_WINDOW_MS = parseInt(process.env.ADMIN_FAIL_WINDOW_MS || String(5 * 60 * 1000), 10);

if (!TIKTOK_USERNAME) {
  console.error('ENV TIKTOK_USERNAME belum diset. Contoh: TIKTOK_USERNAME=namaakun (tanpa @).');
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error('ENV ADMIN_TOKEN belum diset. Set token bebas untuk mengamankan panel admin, mis. ADMIN_TOKEN=rahasia123.');
  process.exit(1);
}
if (!SIGN_API_KEY) {
  console.warn('ENV SIGN_API_KEY belum diset. Tanpa API key, koneksi ke TikTok Live memakai tier gratis EulerStream yang sangat dibatasi dan sering gagal dengan error "Failed to sign request" (403). Daftar key gratis di https://www.eulerstream.com lalu set SIGN_API_KEY di environment variables.');
}

const app = express();
// Di belakang proxy Render (1 hop) supaya req.ip berisi IP klien asli.
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

const state = {
  running: false,
  connecting: false,
  reconnecting: false,
  roomId: null,
  username: TIKTOK_USERNAME,
  lastError: null,
};
let connection = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastRoomId = null;
// Penanda percobaan koneksi. Setiap start/stop menaikkan nilainya, sehingga hasil
// (then/catch/disconnected) dari percobaan lama yang sudah dibatalkan diabaikan.
let attemptId = 0;

// Status untuk klien WebSocket (overlay bisa dibuka siapa saja): hanya info non-sensitif.
// Detail lengkap (username, roomId, lastError) hanya lewat GET /api/status yang butuh token.
function broadcastStatus() {
  broadcast({
    type: 'status',
    running: state.running,
    connecting: state.connecting,
    reconnecting: state.reconnecting,
  });
}

function getStatus() {
  return {
    running: state.running,
    connecting: state.connecting,
    reconnecting: state.reconnecting,
    roomId: state.roomId,
    username: state.username,
    lastError: state.lastError,
  };
}

// ---------- Data sementara penonton (memori saja) ----------
const dobCache = new Map();
const likeCrossed = new Map();
const lastCalc = new Map();

function trimMap(map, max) {
  while (map.size > max) {
    map.delete(map.keys().next().value);
  }
}

function clearViewerData() {
  dobCache.clear();
  likeCrossed.clear();
  lastCalc.clear();
}

function rememberDob(uniqueId, dob) {
  dobCache.delete(uniqueId); // pindahkan ke urutan paling baru
  dobCache.set(uniqueId, Object.assign({}, dob, { at: Date.now() }));
  trimMap(dobCache, CACHE_MAX_ENTRIES);
}

function getDob(uniqueId) {
  const entry = dobCache.get(uniqueId);
  if (!entry) return null;
  if (Date.now() - entry.at > DOB_TTL_MS) {
    dobCache.delete(uniqueId);
    return null;
  }
  return entry;
}

const DATE_REGEX = /\b(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})\b/;

function extractDob(text) {
  if (!text) return null;
  const match = text.match(DATE_REGEX);
  if (!match) return null;
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayISO = new Date().toISOString().slice(0, 10);
  const check = validateDob(iso, todayISO);
  if (!check.valid) return null;
  return { iso, d, m, y };
}

function buildResult(nickname, uniqueId, dob, meta) {
  const lifePath = calculateLifePath(dob.d, dob.m, dob.y);
  const pyramid = calculatePyramid(dob.iso);
  return {
    type: 'result',
    nickname,
    uniqueId,
    dob: dob.iso,
    lifePath,
    pyramid,
    source: meta.source,
    giftName: meta.giftName || null,
    likeMilestone: meta.likeMilestone || null,
    timestamp: Date.now(),
  };
}

function handleChat(data) {
  const dob = extractDob(data.comment);
  if (!dob) return;
  rememberDob(data.uniqueId, dob);

  // Throttle indikator "sedang menghitung" per penonton (anti spam komen).
  const now = Date.now();
  const last = lastCalc.get(data.uniqueId) || 0;
  if (now - last >= CALC_COOLDOWN_MS) {
    lastCalc.delete(data.uniqueId);
    lastCalc.set(data.uniqueId, now);
    trimMap(lastCalc, CACHE_MAX_ENTRIES);
    broadcast({
      type: 'calculating',
      nickname: data.nickname,
      uniqueId: data.uniqueId,
      timestamp: now,
    });
  }
  console.log(`[comment] ${data.nickname} (@${data.uniqueId}) kirim tanggal lahir -> disimpan, menunggu gift/like.`);
}

function handleGift(data) {
  if (data.giftType === 1 && !data.repeatEnd) return;

  const coins = data.diamondCount || 0;
  if (coins < GIFT_MIN_COINS) {
    console.log(`[gift] ${data.nickname} kirim gift ${coins} koin, di bawah ambang ${GIFT_MIN_COINS} koin, dilewati.`);
    return;
  }

  const cached = getDob(data.uniqueId);
  if (!cached) {
    console.log(`[gift] ${data.nickname} (@${data.uniqueId}) kirim gift tapi belum pernah kirim tanggal lahir di komen, dilewati.`);
    return;
  }
  const result = buildResult(data.nickname, data.uniqueId, cached, {
    source: 'gift',
    giftName: data.giftName,
  });
  broadcast(result);
  console.log(`[gift:${data.giftName} (${coins} koin)] ${data.nickname} (@${data.uniqueId}) -> DOB ${cached.iso} -> Angka Hidup ${result.lifePath}`);
}

function handleLike(data) {
  // CATATAN: verifikasi arti totalLikeCount di tiktok-live-connector (total per penonton
  // atau total seluruh room). Logika di bawah mengasumsikan total per penonton.
  const total = data.totalLikeCount || 0;
  if (total <= 0) return;

  const currentMultiple = Math.floor(total / LIKE_THRESHOLD);
  const lastMultiple = likeCrossed.get(data.uniqueId) || 0;
  if (currentMultiple <= lastMultiple) return;
  likeCrossed.delete(data.uniqueId);
  likeCrossed.set(data.uniqueId, currentMultiple);
  trimMap(likeCrossed, CACHE_MAX_ENTRIES);

  const milestone = currentMultiple * LIKE_THRESHOLD;
  const cached = getDob(data.uniqueId);
  if (!cached) {
    console.log(`[like] ${data.nickname} (@${data.uniqueId}) capai ${milestone} like tapi belum pernah kirim tanggal lahir di komen, dilewati.`);
    return;
  }
  const result = buildResult(data.nickname, data.uniqueId, cached, {
    source: 'like',
    likeMilestone: milestone,
  });
  broadcast(result);
  console.log(`[like:${milestone}] ${data.nickname} (@${data.uniqueId}) -> DOB ${cached.iso} -> Angka Hidup ${result.lifePath}`);
}

// Jadwalkan reconnect otomatis dengan backoff eksponensial. Pemanggil yang broadcast status.
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts));
  reconnectAttempts += 1;
  state.reconnecting = true;
  console.warn(`Reconnect ke TikTok Live dijadwalkan dalam ${Math.round(delay / 100) / 10} detik (percobaan ke-${reconnectAttempts}).`);
  reconnectTimer = setTimeout(() => startListener(true), delay);
}

function startListener(isAuto = false) {
  if (state.running || state.connecting) return;
  clearTimeout(reconnectTimer);
  if (!isAuto) reconnectAttempts = 0;
  state.connecting = true;
  state.reconnecting = false;
  state.lastError = null;
  broadcastStatus();

  const id = ++attemptId;
  const connectionOptions = SIGN_API_KEY ? { signApiKey: SIGN_API_KEY } : {};
  const conn = new WebcastPushConnection(state.username, connectionOptions);
  connection = conn;
  conn.on('chat', handleChat);
  conn.on('gift', handleGift);
  conn.on('like', handleLike);
  conn.on('disconnected', () => {
    if (id !== attemptId || !state.running) return;
    state.running = false;
    state.roomId = null;
    reconnectAttempts = 0;
    console.warn('Koneksi TikTok Live terputus.');
    scheduleReconnect();
    broadcastStatus();
  });

  conn.connect()
    .then((info) => {
      if (id !== attemptId) {
        // Dibatalkan (stop) saat masih connecting: tutup koneksi yatim ini.
        try { conn.disconnect(); } catch (_) { /* abaikan */ }
        return;
      }
      // Ganti room (live baru) = data penonton live sebelumnya tidak relevan lagi.
      if (lastRoomId !== null && info.roomId !== lastRoomId) clearViewerData();
      lastRoomId = info.roomId;
      reconnectAttempts = 0;
      state.running = true;
      state.connecting = false;
      state.roomId = info.roomId;
      console.log(`Listener AKTIF: terhubung ke live TikTok @${state.username} (roomId ${info.roomId})`);
      broadcastStatus();
    })
    .catch((err) => {
      if (id !== attemptId) return;
      state.connecting = false;
      state.running = false;
      state.lastError = err.message || String(err);
      console.error('Gagal konek ke TikTok Live:', state.lastError);
      if (!SIGN_API_KEY && /sign request/i.test(state.lastError)) {
        console.error('Kemungkinan penyebab: SIGN_API_KEY belum diset. Daftar key gratis di https://www.eulerstream.com lalu set SIGN_API_KEY di environment variables.');
      }
      // Percobaan otomatis yang gagal: coba lagi. Start manual yang gagal tetap OFF.
      if (isAuto) scheduleReconnect();
      broadcastStatus();
    });
}

function stopListener() {
  clearTimeout(reconnectTimer);
  attemptId++; // batalkan percobaan koneksi yang mungkin masih berjalan
  reconnectAttempts = 0;
  const wasActive = state.running || state.connecting || state.reconnecting;
  state.running = false;
  state.connecting = false;
  state.reconnecting = false;
  state.roomId = null;
  lastRoomId = null;
  if (connection) {
    try { connection.disconnect(); } catch (_) { /* abaikan error saat disconnect */ }
    connection = null;
  }
  // Sesuai README: data penonton hanya ada selama listener aktif.
  clearViewerData();
  if (wasActive) console.log('Listener DIMATIKAN dari panel admin.');
  broadcastStatus();
}

// ---------- Autentikasi admin ----------
const failMap = new Map(); // ip -> { count, resetAt }

function tokensMatch(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkAdminToken(req, res, next) {
  const key = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  let rec = failMap.get(key);
  if (rec && rec.resetAt <= now) { failMap.delete(key); rec = null; }

  if (rec && rec.count >= ADMIN_MAX_FAILS) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((rec.resetAt - now) / 1000))));
    return res.status(429).json({ error: 'Terlalu banyak percobaan token salah. Coba lagi beberapa menit lagi.' });
  }

  if (!tokensMatch(req.header('x-admin-token'), ADMIN_TOKEN)) {
    if (!rec) rec = { count: 0, resetAt: now + ADMIN_FAIL_WINDOW_MS };
    rec.count += 1;
    failMap.set(key, rec);
    return res.status(401).json({ error: 'Token admin salah atau kosong.' });
  }

  if (rec) failMap.delete(key);
  next();
}

app.get('/api/status', checkAdminToken, (req, res) => res.json(getStatus()));
app.post('/api/start', checkAdminToken, (req, res) => { startListener(); res.json(getStatus()); });
app.post('/api/stop', checkAdminToken, (req, res) => { stopListener(); res.json(getStatus()); });

function runLiveTests() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const cases = [
    { name: 'Tanggal valid', dob: '25/01/1994', expectedLifePath: 4 },
    { name: 'Master Number 22', dob: '29/01/1900', expectedLifePath: 22 },
    { name: 'Piramida valid', dob: '12/04/1994', checkPyramid: true },
    { name: 'Tanggal masa depan ditolak', dob: '31/12/2999', expectInvalid: true },
  ];

  const results = cases.map((test) => {
    const match = test.dob.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})$/);
    if (!match) return { name: test.name, pass: false, detail: 'Format test tidak valid.' };

    const d = Number(match[1]);
    const m = Number(match[2]);
    const y = Number(match[3]);
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const validation = validateDob(iso, todayISO);

    if (test.expectInvalid) {
      return {
        name: test.name,
        pass: !validation.valid,
        detail: validation.valid ? 'Tanggal masa depan diterima.' : `Ditolak: ${validation.reason}`,
      };
    }

    if (!validation.valid) {
      return { name: test.name, pass: false, detail: `Validasi gagal: ${validation.reason}` };
    }

    const lifePath = calculateLifePath(d, m, y);
    const pyramid = calculatePyramid(iso);
    const pass = test.checkPyramid
      ? !!pyramid && Number.isInteger(pyramid.apex) && pyramid.apex >= 1 && pyramid.apex <= 9
      : lifePath === test.expectedLifePath;

    return {
      name: test.name,
      pass,
      detail: `DOB ${iso} -> Angka Hidup ${lifePath}, apex ${pyramid.apex}`,
    };
  });

  return {
    type: 'test-result',
    timestamp: Date.now(),
    pass: results.every((r) => r.pass),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    results,
    listenerRunning: state.running,
    stateChanged: false,
  };
}

app.post('/api/test/live', checkAdminToken, (req, res) => {
  try {
    res.json(runLiveTests());
  } catch (err) {
    res.status(500).json({ type: 'test-result', pass: false, error: err.message || String(err) });
  }
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'status',
    running: state.running,
    connecting: state.connecting,
    reconnecting: state.reconnecting,
  }));
});

// Pembersihan berkala: entri kedaluwarsa dibuang supaya memori tidak membengkak.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of dobCache) if (now - v.at > DOB_TTL_MS) dobCache.delete(k);
  for (const [k, t] of lastCalc) if (now - t > CALC_COOLDOWN_MS) lastCalc.delete(k);
  for (const [k, r] of failMap) if (r.resetAt <= now) failMap.delete(k);
}, 10 * 60 * 1000);
cleanupTimer.unref();

server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  console.log(`Panel admin: /admin.html  |  Overlay OBS: /overlay.html`);
  console.log(`Aturan pemicu kartu hasil: gift >= ${GIFT_MIN_COINS} koin, atau like kelipatan ${LIKE_THRESHOLD} per penonton. Komen hanya memicu indikator 'sedang menghitung'.`);
  console.log('Listener TikTok dalam keadaan OFF. Nyalakan lewat panel admin.');
});
