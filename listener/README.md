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
3. Set sebagai environment variable `SIGN_API_KEY` (lokal di `.env`, atau di Render dashboard).

Tier gratis EulerStream sudah cukup untuk pemakaian personal (satu listener, satu live pada satu waktu). Kalau butuh volume lebih besar, EulerStream juga punya paket berbayar.

## Deploy ke Render

Dipakai dengan plan **gratis** (lihat `render.yaml` di root repo, `plan: free`) — cocok untuk kebutuhan "aktif saat dipakai saja, bukan 24/7":
- Service otomatis tidur setelah ±15 menit tanpa traffic (hemat, gratis).
- Listener TikTok sendiri tetap nurut ke toggle admin, tidak otomatis connect walau service sedang "bangun".
- Kalau service sempat tidur, saat kamu buka panel admin akan ada jeda cold-start 30–60 detik sebelum halaman merespons — normal, bukan error.
- Selama overlay dibuka di OBS/app streaming (koneksi WebSocket aktif), service tetap "bangun" sepanjang live.
- Kalau butuh benar-benar 24/7 tanpa jeda, upgrade plan Render ke Starter dan ubah `plan: free` di `render.yaml` jadi `plan: starter`.

### Cara cepat (pakai Blueprint)
1. Dashboard Render → **New +** → **Blueprint** → hubungkan repo ini.
2. Render otomatis baca `render.yaml` di root repo dan buat Web Service `numerologi-tiktok-listener` dengan root dir `listener`.
3. Saat deploy pertama, isi Environment Variable `TIKTOK_USERNAME` (tanpa `@`), `ADMIN_TOKEN` (bebas, ini password untuk panel admin), dan `SIGN_API_KEY` (dari eulerstream.com). `GIFT_MIN_COINS` dan `LIKE_THRESHOLD` opsional.

### Cara manual
1. New + Web Service, Root Directory `listener`, Build Command `npm install`, Start Command `npm start`.
2. Tambahkan Environment Variables `TIKTOK_USERNAME`, `ADMIN_TOKEN`, dan `SIGN_API_KEY` (plus `GIFT_MIN_COINS`/`LIKE_THRESHOLD` jika mau ubah default).

Setelah deploy:
- Panel admin: `https://<nama-service>.onrender.com/admin.html`
- Overlay (Browser Source OBS): `https://<nama-service>.onrender.com/overlay.html`

## Troubleshooting

- **`Failed to sign request ... status code 403`**: `SIGN_API_KEY` belum diset atau sudah tidak valid. Daftar/cek key di [eulerstream.com](https://www.eulerstream.com) dan pastikan env var-nya benar. Cek log server saat start — kalau `SIGN_API_KEY` kosong akan muncul warning eksplisit soal ini.
- Akun yang dipakai harus **sedang live** saat listener dinyalakan, kalau tidak koneksi akan gagal dan `lastError` muncul di panel admin.
- `tiktok-live-connector` mengandalkan API tidak resmi TikTok yang bisa berubah sewaktu-waktu; jika koneksi gagal terus meski `SIGN_API_KEY` sudah benar, cek versi paket terbaru dan changelog resminya.

## Catatan

- Panel admin dilindungi `ADMIN_TOKEN` sederhana lewat header `x-admin-token` — cukup untuk mencegah orang iseng, tapi jangan bagikan link admin ke publik.
- Gift dengan combo (misal Rose ditahan) baru diproses saat combo selesai (`repeatEnd`), supaya tidak spam overlay.
- Komen berisi tanggal lahir hanya disimpan sementara di memori (per sesi listener), untuk dipakai saat penonton itu kirim gift/like yang lolos ambang batas. Tidak ditampilkan langsung dan tidak disimpan permanen.
