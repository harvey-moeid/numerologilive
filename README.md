# Jalur Numerology — Kalkulator Angka Hidup

Website statis kalkulator numerologi Angka Hidup, berbahasa Indonesia. Domain: [numerology.muidsoft.com](https://numerology.muidsoft.com)

## Struktur
- `index.html` — markup + SEO dasar
- `styles.css` — presentasi
- `calculator.js` — logika kalkulasi murni
- `interpretations.js` — data tafsiran
- `app.js` — UI state & event handling
- `assets/icons/` — favicon
- `assets/og/` — Open Graph image
- `robots.txt`
- `sitemap.xml`
- `render.yaml` — konfigurasi Blueprint Render untuk service listener (lihat di bawah)
- `PRD_Kalkulator_Numerologi_Angka_Hidup_Lengkap.md`
- `listener/` — service Node.js terpisah: konektor TikTok Live + overlay OBS + panel admin. Detail lengkap ada di [`listener/README.md`](listener/README.md).

## Cloudflare Pages (situs kalkulator statis)
Build command: kosongkan (static site).
Output directory: `/` (root proyek).

## Listener TikTok Live + Overlay (`listener/`)
Service Node.js terpisah yang mendengarkan komen & gift di TikTok Live, menghitung Angka Hidup dari tanggal lahir yang ditulis penonton, lalu menampilkannya sebagai overlay premium di OBS. Ada panel admin untuk toggle on/off. Deploy sebagai Web Service terpisah di Render (bisa lewat `render.yaml`). Lihat [`listener/README.md`](listener/README.md) untuk cara menjalankan lokal dan deploy.

## Catatan production
Validasi rumus metode "Power of Numbers" dan review tafsiran sebelum production.

## Privacy
Kalkulasi di situs utama berjalan di browser (client-side). Tanggal lahir tidak dikirim atau disimpan ke server pada versi ini. Untuk listener TikTok Live, tanggal lahir dari komen hanya disimpan sementara di memori server (tidak persisten) selama listener aktif, guna mencocokkan gift dengan komen sebelumnya.
