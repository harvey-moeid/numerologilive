# Numerologi TikTok Live Listener

Service Node.js terpisah dari situs statis di root repo. Tugasnya:

1. Konek ke TikTok Live (via `tiktok-live-connector`) untuk akun yang ditentukan.
2. Saat ada **komen** yang mengandung tanggal lahir (format `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`, atau `DD MM YYYY`), hitung Angka Hidup + piramida numerologi memakai logika yang sama dengan `calculator.js` di root.
3. Saat penonton yang sama mengirim **gift**, tampilkan ulang hasil numerologinya (pakai tanggal lahir terakhir yang pernah dia kirim di komen).
4. Kirim hasilnya real-time lewat WebSocket ke halaman overlay (`public/overlay.html`) yang bisa ditambahkan sebagai **Browser Source** di OBS.

## Menjalankan lokal

```bash
cd listener
cp .env.example .env   # isi TIKTOK_USERNAME dengan username TikTok (tanpa @)
npm install
npm start
```

Buka `http://localhost:3000/overlay.html` sebagai Browser Source di OBS.

## Deploy ke Render

1. New + Web Service di Render, hubungkan ke repo ini.
2. **Root Directory**: `listener`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Tambahkan Environment Variable `TIKTOK_USERNAME` = username TikTok yang live.
6. Setelah deploy, overlay dapat diakses di `https://<nama-service>.onrender.com/overlay.html` dan ditambahkan sebagai Browser Source di OBS (centang "Shutdown source when not visible" OFF, background sudah transparan).

## Catatan

- Akun yang dipakai harus **sedang live** saat service dijalankan, kalau tidak koneksi akan retry otomatis tiap beberapa detik.
- `tiktok-live-connector` mengandalkan API tidak resmi TikTok yang bisa berubah sewaktu-waktu; jika koneksi gagal terus, cek versi paket terbaru.
- Gift dengan combo (misal Rose ditahan) baru diproses saat combo selesai (`repeatEnd`), supaya tidak spam overlay.
