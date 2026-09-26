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

// ---------- State listener (on/off dikontrol dari panel admin) ----------
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

// ---------- Numerologi dari komen/gift ----------
const dobCache = new Map();
// Pola tanggal umum di komen: 12-05-1999 / 12/05/1999 / 12.05.1999 / 12 05 1999
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
    timestamp: Date.now(),
  };
}

function handleChat(data) {
  const dob = extractDob(data.comment);
  if (!dob) return;
  dobCache.set(data.uniqueId, dob);
  const result = buildResult(data.nickname, data.uniqueId, dob, { source: 'comment' });
  broadcast(result);
  console.log(`[comment] ${data.nickname} (@${data.uniqueId}) -> DOB ${dob.iso} -> Angka Hidup ${result.lifePath}`);
}

function handleGift(data) {
  if (data.giftType === 1 && !data.repeatEnd) return;
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
  console.log(`[gift:${data.giftName}] ${data.nickname} (@${data.uniqueId}) -> DOB ${cached.iso} -> Angka Hidup ${result.lifePath}`);
}

// ---------- Start / stop listener TikTok ----------
function startListener() {
  if (state.running || state.connecting) return; // sudah jalan, abaikan
  state.connecting = true;
  state.lastError = null;
  broadcastStatus();

  connection = new WebcastPushConnection(state.username);
  connection.on('chat', handleChat);
  connection.on('gift', handleGift);
  connection.on('disconnected', () => {
    if (!state.running) return; // sudah dihentikan manual, jangan auto-reconnect
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

// ---------- API admin (dilindungi token) ----------
function checkAdminToken(req, res, next) {
  const token = req.header('x-admin-token');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Token admin salah atau kosong.' });
  next();
}

app.get('/api/status', checkAdminToken, (req, res) => res.json(getStatus()));
app.post('/api/start', checkAdminToken, (req, res) => { startListener(); res.json(getStatus()); });
app.post('/api/stop', checkAdminToken, (req, res) => { stopListener(); res.json(getStatus()); });

// Kirim status terkini ke setiap client WebSocket baru yang connect (overlay/admin)
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'status', ...getStatus() }));
});

server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  console.log(`Panel admin: /admin.html  |  Overlay OBS: /overlay.html`);
  console.log('Listener TikTok dalam keadaan OFF. Nyalakan lewat panel admin.');
});
