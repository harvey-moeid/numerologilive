require('dotenv').catch(() => {}); // no-op guard kalau dotenv tak terpasang, env tetap bisa dari platform (Render)
try { require('dotenv/config'); } catch (_) { /* dotenv opsional, Render biasanya inject env langsung */ }

const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { calculateLifePath, calculatePyramid, validateDob } = require('./calculator');

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const PORT = process.env.PORT || 3000;

if (!TIKTOK_USERNAME) {
  console.error('ENV TIKTOK_USERNAME belum diset. Contoh: TIKTOK_USERNAME=namaakun (tanpa @).');
  process.exit(1);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true, username: TIKTOK_USERNAME }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

// Cache tanggal lahir per penonton (uniqueId) supaya saat dia kirim gift
// tanpa teks, kita masih tahu Angka Hidupnya dari komen sebelumnya.
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
  if (!dob) return; // komen tanpa tanggal lahir diabaikan
  dobCache.set(data.uniqueId, dob);
  const result = buildResult(data.nickname, data.uniqueId, dob, { source: 'comment' });
  broadcast(result);
  console.log(`[comment] ${data.nickname} (@${data.uniqueId}) -> DOB ${dob.iso} -> Angka Hidup ${result.lifePath}`);
}

function handleGift(data) {
  // Gift combo mengirim event berulang selagi user masih menahan tombol;
  // proses hanya saat combo selesai (repeatEnd) atau gift bukan tipe combo.
  if (data.giftType === 1 && !data.repeatEnd) return;

  // Gift biasa tidak membawa teks komen, jadi pakai DOB terakhir yang
  // pernah dikirim penonton ini lewat komen.
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

function connectToTikTok() {
  const connection = new WebcastPushConnection(TIKTOK_USERNAME);

  connection.connect()
    .then((state) => console.log(`Terhubung ke live TikTok @${TIKTOK_USERNAME} (roomId ${state.roomId})`))
    .catch((err) => {
      console.error('Gagal konek ke TikTok Live, retry dalam 10 detik:', err.message || err);
      setTimeout(connectToTikTok, 10000);
    });

  connection.on('chat', handleChat);
  connection.on('gift', handleGift);
  connection.on('disconnected', () => {
    console.warn('Koneksi TikTok Live terputus, mencoba reconnect dalam 5 detik...');
    setTimeout(connectToTikTok, 5000);
  });

  return connection;
}

connectToTikTok();

server.listen(PORT, () => {
  console.log(`Listener + overlay server jalan di port ${PORT}`);
  console.log(`Buka overlay di /overlay.html (tambahkan sebagai Browser Source di OBS)`);
});
