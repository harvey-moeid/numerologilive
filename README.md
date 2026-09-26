# Numerologi Angka Hidup — Kalkulator

Website statis kalkulator numerologi Angka Hidup, berbahasa Indonesia.

## Struktur
- index.html — markup + SEO dasar
- styles.css — presentasi
- calculator.js — logika kalkulasi murni
- interpretations.js — data tafsiran
- app.js — UI state & event handling
- assets/icons/ — favicon
- assets/og/ — Open Graph image
- robots.txt
- sitemap.xml
- PRD_Kalkulator_Numerologi_Angka_Hidup_Lengkap.md

## Cloudflare Pages
Build command: kosongkan (static site).
Output directory: `/` (root proyek).

## Catatan production
Validasi rumus metode "Power of Numbers", review tafsiran, ganti placeholder domain, dan tambahkan favicon/OG image sebelum production.

## Privacy
Kalkulasi berjalan di browser (client-side). Tanggal lahir tidak dikirim atau disimpan ke server pada versi ini.