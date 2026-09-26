try { require('dotenv/config'); } catch (_) { /* dotenv opsional untuk lokal; Render inject env langsung */ }

const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { calculateLifePath, calculatePyramid, validateDob } = require('./calculator');

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const PORT = process.env.PORT || 3000;

const GIFT_MIN_COINS = parseInt(process.env.GIFT_MIN_COINS || '1', 10);
const LIKE_THRESHOLD = parseInt(process.env.LIKE_THRESHOLD || '40', 10);

if (!TIKTOK_USERNAME) {
  console.error('ENV TIKTOK_USERNAME belum diset. Contoh: TIKTOK_USERNAME=namaakun (tanpa @).');
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error('ENV ADMIN_TOKEN belum diset. Set token bebas untuk mengamankan panel admin, mis. ADMIN_TOKEN=rahasia123.');
  process.exit(1);
}

const app = express();
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
  roomId: null,
  username: TIKTOK_USERNAME,
  lastError: null,
};
let connection = null;
let reconnectTimer = null;

function broadcastStatus() {
  broadcast({
    type: 'status',
    running: state.running,
    connecting: state.connecting,
    roomId: state.roomId,
    username: state.username,
    lastError: state.lastError,
  });
}

function getStatus() {
  return {
    running: state.running,
    connecting: state.connecting,
    roomId: state.roomId,
    username: state.username,
    lastError: state.lastError,
  };
}

const dobCache = new Map();
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
  dobCache.set(data.uniqueId, dob);
  broadcast({
    type: 'calculating',
    nickname: data.nickname,
    uniqueId: data.uniqueId,
    timestamp: Date.now(),
  });
  console.log(`[comment] ${data.nickname} (@${data.uniqueId}) kirim tanggal lahir -> disimpan, menunggu gift/like.`);
}

function handleGift(data) {
  if (data.giftType === 1 && !data.repeatEnd) return;

  const coins = data.diamondCount || 0;
  if (coins < GIFT_MIN_COINS) {
    console.log(`[gift] ${data.nickname} kirim gift ${coins} koin, di bawah ambang ${GIFT_MIN_COINS} koin, dilewati.`);
    return;
  }

  const cached = dobCache.get(data.uniqueId);
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

const likeCrossed = new Map();

function handleLike(data) {
  const total = data.totalLikeCount || 0;
  if (total <= 0) return;

  const currentMultiple = Math.floor(total / LIKE_THRESHOLD);
  const lastMultiple = likeCrossed.get(data.uniqueId) || 0;
  if (currentMultiple <= lastMultiple) return;
  likeCrossed.set(data.uniqueId, currentMultiple);

  const milestone = currentMultiple * LIKE_THRESHOLD;
  const cached = dobCache.get(data.uniqueId);
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

function startListener() {
  if (state.running || state.connecting) return;
  state.connecting = true;
  state.lastError = null;
  broadcastStatus();

  connection = new WebcastPushConnection(state.username);
  connection.on('chat', handleChat);
  connection.on('gift', handleGift);
  connection.on('like', handleLike);
  connection.on('disconnected', () => {
    if (!state.running) return;
    console.warn('Koneksi TikTok Live terputus, mencoba reconnect dalam 5 detik...');
    state.running = false;
    state.roomId = null;
    broadcastStatus();
    reconnectTimer = setTimeout(startListener, 5000);
  });

  connection.connect()
    .then((info) => {
      state.running = true;
      state.connecting = false;
      state.roomId = info.roomId;
      console.log(`Listener AKTIF: terhubung ke live TikTok @${state.username} (roomId ${info.roomId})`);
      broadcastStatus();
    })
    .catch((err) => {
      state.connecting = false;
      state.running = false;
      state.lastError = err.message || String(err);
      console.error('Gagal konek ke TikTok Live:', state.lastError);
      broadcastStatus();
    });
}

function stopListener() {
  clearTimeout(reconnectTimer);
  const wasRunning = state.running || state.connecting;
  state.running = false;
  state.connecting = false;
  state.roomId = null;
  if (connection) {
    try { connection.disconnect(); } catch (_) { /* abaikan error saat disconnect */ }
    connection = null;
  }
  if (wasRunning) console.log('Listener DIMATIKAN dari panel admin.');
  broadcastStatus();
}

function checkAdminToken(req, res, next) {
  const token = req.header('x-admin-token');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Token admin salah atau kosong.' });
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
  ws.send(JSON.stringify({ type: 'status', ...getStatus() }));
});

server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  console.log(`Panel admin: /admin.html  |  Overlay OBS: /overlay.html`);
  console.log(`Aturan pemicu kartu hasil: gift >= ${GIFT_MIN_COINS} koin, atau like kelipatan ${LIKE_THRESHOLD} per penonton. Komen hanya memicu indikator 'sedang menghitung'.`);
  console.log('Listener TikTok dalam keadaan OFF. Nyalakan lewat panel admin.');
});
