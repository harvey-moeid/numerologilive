# Numerologi TikTok Live Listener

Service Node.js terpisah dari situs statis di root repo. Tugasnya:

1. Konek ke TikTok Live (via `tiktok-live-connector`) untuk akun yang ditentukan, **hanya saat dinyalakan lewat panel admin**.
2. Saat ada **komen** yang mengandung tanggal lahir (format `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`, atau `DD MM YYYY`), hitung Angka Hidup + piramida numerologi memakai logika yang sama dengan `calculator.js` di root.
3. Saat penonton yang sama mengirim **gift**, tampilkan ulang hasil numerologinya (pakai tanggal lahir terakhir yang pernah dia kirim di komen).
4. Kirim hasilnya real-time lewat WebSocket ke halaman overlay (`public/overlay.html`) yang bisa ditambahkan sebagai **Browser Source** di OBS.
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

## Deploy ke Render

### Cara cepat (pakai Blueprint)
1. Dashboard Render → **New +** → **Blueprint** → hubungkan repo ini.
2. Render otomatis baca `render.yaml` di root repo dan buat Web Service `numerologi-tiktok-listener` dengan root dir `listener`.
3. Saat deploy pertama, isi Environment Variable `TIKTOK_USERNAME` (tanpa `@`) dan `ADMIN_TOKEN` (bebas, ini password untuk panel admin).

### Cara manual
1. New + Web Service, Root Directory `listener`, Build Command `npm install`, Start Command `npm start`.
2. Tambahkan Environment Variables `TIKTOK_USERNAME` dan `ADMIN_TOKEN`.

Setelah deploy:
- Panel admin: `https://<nama-service>.onrender.com/admin.html`
- Overlay (Browser Source OBS): `https://<nama-service>.onrender.com/overlay.html`

## Catatan

- Panel admin dilindungi `ADMIN_TOKEN` sederhana lewat header `x-admin-token` — cukup untuk mencegah orang iseng, tapi jangan bagikan link admin ke publik.
- Akun yang dipakai harus **sedang live** saat listener dinyalakan, kalau tidak koneksi akan gagal dan `lastError` muncul di panel admin.
- `tiktok-live-connector` mengandalkan API tidak resmi TikTok yang bisa berubah sewaktu-waktu; jika koneksi gagal terus, cek versi paket terbaru.
- Gift dengan combo (misal Rose ditahan) baru diproses saat combo selesai (`repeatEnd`), supaya tidak spam overlay.
