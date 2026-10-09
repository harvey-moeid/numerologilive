# Jalur Numerology — TikTok Live Listener

Service Node.js terpisah dari situs statis di root repo. Tugasnya:

1. Konek ke TikTok Live (via `tiktok-live-connector`) untuk akun yang ditentukan, **hanya saat dinyalakan lewat panel admin** — listener tidak pernah jalan 24/7 dengan sendirinya.
2. Saat ada **komen** yang mengandung tanggal lahir (format `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`, atau `DD MM YYYY`), tanggal lahirnya disimpan sementara di memori. Overlay hanya menampilkan indikator kecil "Menghitung untuk @akun..." — **bukan** kartu hasil.
3. Kartu hasil Angka Hidup baru **muncul di overlay** kalau penonton yang sama melakukan salah satu:
   - Mengirim **gift senilai minimal 1 koin** (default; bisa diubah lewat env `GIFT_MIN_COINS`), atau
   - Mencapai **kelipatan 400 like kumulatif** selama live tersebut (default; bisa diubah lewat env `LIKE_THRESHOLD`) — jadi tiap penonton bisa memicu ulang tiap dia menambah 400 like lagi.
4. Semuanya dikirim real-time lewat WebSocket ke halaman overlay (`public/overlay.html`, responsif untuk kanvas landscape maupun potret/mobile), dengan gaya visual berbeda untuk gift (emas) dan like (pink) — siap dipakai sebagai **Browser Source** di OBS atau app streaming lain.
5. **Panel admin** (`public/admin.html`) berisi toggle On/Off: aktifkan listener saat mulai live, matikan saat selesai.

## Menjalankan lokal

```bash
cd listener
cp .env.example .env   # isi TIKTOK_USERNAME, ADMIN_TOKEN, dan SIGN_API_KEY
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
| `SIGN_API_KEY` | sangat disarankan | - | API key dari [EulerStream](https://www.eulerstream.com) (gratis) untuk menandatangani koneksi ke TikTok Live. Tanpa ini, koneksi memakai tier gratis anonim yang sangat dibatasi dan sering gagal dengan error `Failed to sign request` (403) |
| `GIFT_MIN_COINS` | tidak | `1` | Nilai koin minimal gift agar memicu kartu hasil |
| `LIKE_THRESHOLD` | tidak | `400` | Kelipatan like kumulatif per penonton agar memicu kartu hasil |

### Cara dapat `SIGN_API_KEY`

1. Daftar akun gratis di [eulerstream.com](https://www.eulerstream.com).
2. Buat API key dari dashboard mereka.
3. Set sebagai environment variable `SIGN_API_KEY` (lokal di `.env`, atau di pengaturan environment platform hosting).

Tier gratis EulerStream sudah cukup untuk pemakaian personal (satu listener, satu live pada satu waktu). Kalau butuh volume lebih besar, EulerStream juga punya paket berbayar.

## Deploy listener secara manual

Listener adalah service Node.js yang dapat dijalankan secara lokal atau di platform hosting Node.js pilihan. Repositori ini **tidak menyertakan workflow GitHub Actions untuk deploy Render maupun file Blueprint `render.yaml`**.

Jika memilih membuat Web Service di Render secara manual:
1. Buat Web Service baru dan hubungkan repository ini.
2. Set Root Directory: `listener`, Build Command: `npm install`, dan Start Command: `npm start`.
3. Atur `TIKTOK_USERNAME`, `ADMIN_TOKEN`, dan `SIGN_API_KEY` melalui environment variables. `GIFT_MIN_COINS` dan `LIKE_THRESHOLD` opsional.
4. Pastikan URL service dapat dijangkau sebelum mengaktifkan listener dari panel admin.

Untuk Render, URL umumnya:
- Panel admin: `https://<nama-service>.onrender.com/admin.html`
- Overlay OBS: `https://<nama-service>.onrender.com/overlay.html`

Penghapusan Blueprint dari GitHub **tidak otomatis menghentikan atau menghapus service yang sudah ada di akun Render**. Kelola layanan tersebut langsung melalui dashboard Render jika tidak lagi digunakan.

## Troubleshooting

- **`Failed to sign request ... status code 403`**: `SIGN_API_KEY` belum diset atau sudah tidak valid. Daftar/cek key di [eulerstream.com](https://www.eulerstream.com) dan pastikan env var-nya benar. Cek log server saat start — kalau `SIGN_API_KEY` kosong akan muncul warning eksplisit soal ini.
- Akun yang dipakai harus **sedang live** saat listener dinyalakan, kalau tidak koneksi akan gagal dan `lastError` muncul di panel admin.
- `tiktok-live-connector` mengandalkan API tidak resmi TikTok yang bisa berubah sewaktu-waktu; jika koneksi gagal terus meski `SIGN_API_KEY` sudah benar, cek versi paket terbaru dan changelog resminya.

## Catatan

- Panel admin dilindungi `ADMIN_TOKEN` sederhana lewat header `x-admin-token` — cukup untuk mencegah orang iseng, tapi jangan bagikan link admin ke publik.
- Gift dengan combo (misal Rose ditahan) baru diproses saat combo selesai (`repeatEnd`), supaya tidak spam overlay.
- Komen berisi tanggal lahir hanya disimpan sementara di memori (per sesi listener), untuk dipakai saat penonton itu kirim gift/like yang lolos ambang batas. Tidak ditampilkan langsung dan tidak disimpan permanen.
