# Jalur Numerology — TikTok Live Listener

Service Node.js terpisah dari situs statis di root repo. Tugasnya:

1. Konek ke TikTok Live (via `tiktok-live-connector`) untuk akun yang ditentukan, **hanya saat dinyalakan lewat panel admin**.
2. Saat ada **komen** yang mengandung tanggal lahir (format `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`, atau `DD MM YYYY`), tanggal lahirnya disimpan (tidak langsung memicu overlay).
3. Pembacaan Angka Hidup baru **dipicu overlay** kalau penonton yang sama melakukan salah satu:
   - Mengirim **gift senilai minimal 1 koin** (default; bisa diubah lewat env `GIFT_MIN_COINS`), atau
   - Mencapai **kelipatan 400 like kumulatif** selama live tersebut (default; bisa diubah lewat env `LIKE_THRESHOLD`) — jadi tiap penonton bisa memicu ulang tiap dia menambah 400 like lagi.
4. Hasilnya dikirim real-time lewat WebSocket ke halaman overlay (`public/overlay.html`), dengan gaya visual berbeda untuk komen (ungu), gift (emas), dan like (pink) — siap dipakai sebagai **Browser Source** di OBS.
5. **Panel admin** (`public/admin.html`) berisi toggle On/Off: aktifkan listener saat mulai live, matikan saat selesai.

## Menjalankan lokal

```bash
cd listener
cp .env.example .env   # isi TIKTOK_USERNAME dan ADMIN_TOKEN
npm install
npm start
```

- Panel admin: `http://localhost:3000/admin.html` (akan minta ADMIN_TOKEN saat pertama dibuka, tersimpan di localStorage browser).
- Overlay OBS: `http://localhost:3000/overlay.html`

Listener **tidak otomatis nyala** saat server start — harus di-toggle ON dari panel admin setiap kali mau mulai live, dan di-toggle OFF saat selesai (listener juga otomatis mati kalau koneksi TikTok putus dan tidak berhasil reconnect, sampai dinyalakan manual lagi).

## Env variables

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `TIKTOK_USERNAME` | ya | - | Username TikTok yang live, tanpa `@` |
| `ADMIN_TOKEN` | ya | - | Password sederhana untuk panel admin |
| `PORT` | tidak | `3000` | Port server |
| `GIFT_MIN_COINS` | tidak | `1` | Nilai koin minimal gift agar memicu pembacaan |
| `LIKE_THRESHOLD` | tidak | `400` | Kelipatan like kumulatif per penonton agar memicu pembacaan |

## Deploy ke Render

### Cara cepat (pakai Blueprint)
1. Dashboard Render → **New +** → **Blueprint** → hubungkan repo ini.
2. Render otomatis baca `render.yaml` di root repo dan buat Web Service `numerologi-tiktok-listener` dengan root dir `listener`.
3. Saat deploy pertama, isi Environment Variable `TIKTOK_USERNAME` (tanpa `@`) dan `ADMIN_TOKEN` (bebas, ini password untuk panel admin). `GIFT_MIN_COINS` dan `LIKE_THRESHOLD` opsional.

### Cara manual
1. New + Web Service, Root Directory `listener`, Build Command `npm install`, Start Command `npm start`.
2. Tambahkan Environment Variables `TIKTOK_USERNAME` dan `ADMIN_TOKEN` (plus `GIFT_MIN_COINS`/`LIKE_THRESHOLD` jika mau ubah default).

Setelah deploy:
- Panel admin: `https://<nama-service>.onrender.com/admin.html`
- Overlay (Browser Source OBS): `https://<nama-service>.onrender.com/overlay.html`

## Catatan

- Panel admin dilindungi `ADMIN_TOKEN` sederhana lewat header `x-admin-token` — cukup untuk mencegah orang iseng, tapi jangan bagikan link admin ke publik.
- Akun yang dipakai harus **sedang live** saat listener dinyalakan, kalau tidak koneksi akan gagal dan `lastError` muncul di panel admin.
- `tiktok-live-connector` mengandalkan API tidak resmi TikTok yang bisa berubah sewaktu-waktu; jika koneksi gagal terus, cek versi paket terbaru.
- Gift dengan combo (misal Rose ditahan) baru diproses saat combo selesai (`repeatEnd`), supaya tidak spam overlay.
- Komen berisi tanggal lahir hanya disimpan sementara di memori (per sesi listener), untuk dipakai saat penonton itu kirim gift/like yang lolos ambang batas. Tidak disimpan permanen.
