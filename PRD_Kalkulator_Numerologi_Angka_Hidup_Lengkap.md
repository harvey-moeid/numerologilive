# PRD: Kalkulator Numerologi â Angka Hidup

Versi 1.0 â 25 September 2026

## Ringkasan
Website kalkulator numerologi berbahasa Indonesia yang memungkinkan pengguna memasukkan tanggal lahir dan memperoleh Angka Hidup (Life Path Number), visual hasil, serta tafsiran yang mudah dipahami. MVP gratis, tanpa login, mobile-first, client-side dan dapat dibagikan.

## Tujuan
1. Menghitung Angka Hidup dalam satu alur sederhana.
2. Menampilkan hasil cepat dan mudah dipahami.
3. Mobile-first, tanpa akun/database untuk kalkulasi dasar.
4. Memisahkan logic kalkulasi, konten dan UI.
5. Tidak mengklaim numerologi sebagai metode ilmiah tervalidasi.

## MVP
- Landing page dan input tanggal lahir.
- Validasi tanggal/future date/rentang tahun.
- Kalkulasi client-side.
- Dukungan Angka Master 11/22/33.
- Hasil, ringkasan, kekuatan, tantangan, saran.
- Visual SVG/bagan.
- Web Share API + clipboard fallback.
- Reset/hitung lagi.
- Responsive, accessibility dasar, reduced motion.
- SEO dasar, OG, canonical, robots, sitemap.
- Disclaimer dan privacy-first.

## Arsitektur
Static/serverless; Cloudflare Pages.
- calculator.js: pure calculation.
- interpretations.js: content/data.
- app.js: UI state/events.
- styles.css: presentation.
- assets/: visual resources.

## Privacy
Kalkulasi dilakukan di browser. Jangan menyimpan tanggal lahir ke server pada MVP dan jangan mengirim tanggal lahir mentah ke analytics.

## Editorial
Gunakan Bahasa Indonesia natural, framing reflektif, tanpa klaim kepastian mutlak. Konten harus orisinal.

## Testing
Uji reduksi angka, Master 11/22/33, tanggal invalid/future, share fallback, mobile viewport, keyboard, reduced motion, dan alur landing â input â result â share/reset.

## Definition of Done
Rumus dan tafsiran tervalidasi, tidak ada placeholder/mojibake, semua angka didukung, validasi dan share bekerja, mobile/accessibility/SEO lulus, tidak ada secret, test dan smoke test lulus.

## Open Decisions
1. Source of truth rumus Power of Numbers.
2. Aturan Angka Master 11/22/33.
3. Rentang tahun.
4. Domain/brand final.
5. Final visual identity.
6. Kategori hasil.
7. Analytics.
8. Share-image.
9. Waktu rilis modul TikTok/OBS.

## Roadmap
Phase 0 validation â Phase 1 MVP â Phase 1.1 polish â Phase 2 expansion â Phase 3 optional productization.

**Catatan:** rumus pada source saat ini adalah implementasi teknis awal dan tetap perlu divalidasi sebelum production release.

### Live Testing di Panel Admin
Panel admin listener menyediakan tombol **Jalankan Live Testing** yang memanggil `POST /api/test/live` dengan `ADMIN_TOKEN`.

Live Testing menggunakan data sintetis dan tidak:
- menyambungkan atau memutus koneksi TikTok Live;
- mengubah status ON/OFF listener;
- menyimpan tanggal lahir atau hasil ke database.

Skenario minimum:
1. tanggal lahir valid;
2. perhitungan Angka Hidup;
3. Master Number 22;
4. perhitungan piramida/apex;
5. tanggal masa depan harus ditolak.

Panel menampilkan status LULUS/GAGAL, jumlah test yang lulus, dan detail setiap kasus. Endpoint dilindungi `x-admin-token`.