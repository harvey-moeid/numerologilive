# Jalur Numerology — Kalkulator Angka Hidup

Website numerologi berbahasa Indonesia dengan integrasi TikTok LIVE tersentralisasi. Domain yang direncanakan: [numerology.muidsoft.com](https://numerology.muidsoft.com).

## Arsitektur

- **Website statis** (`index.html`, `styles.css`, `calculator.js`, `interpretations.js`, `app.js`) bekerja langsung di browser, tanpa login.
- **Cloudflare Pages Functions** (`functions/api/tiktok/[action].js`) meneruskan REST API TikTok ke `tiktok-live-konektor`. Secret konektor tidak pernah ditulis di client.
- **Overlay LIVE** (`live.html`, `live-overlay.mjs`, `live-engine.mjs`) menggunakan *polling* event dari fungsi Cloudflare (setiap ±2 detik), tanpa membuka koneksi TikTok tersendiri.
- **TikTok LIVE connector pusat** tetap dikelola dan diaktifkan dari [repo tiktok-live-konektor](https://github.com/harvey-moeid/tiktok-live-konektor). Tidak ada listener Node/Render dalam repo ini.

Alur: TikTok LIVE → tiktok-live-konektor (Render) → REST API v1 → Cloudflare Pages Function → browser overlay. Dashboard utama hanya menampilkan banner saat LIVE; komentar dan identitas penonton **tidak** dibuka lewat endpoint publik.

## Konfigurasi Cloudflare Pages

Di Cloudflare **Workers & Pages → Pages project** yang tersambung ke **`harvey-moeid/numerologilive`** (branch `main`):

- Framework: None
- Root directory: `/`
- Build command: kosong
- Build output directory: `/` (root repo)
- Folder `functions/` otomatis dideteksi oleh Pages. Gunakan **Pages project Git-connected**, bukan unggahan statis yang mengabaikan Functions.

**Settings → Variables and Secrets**, atur di **Production** (dan Preview jika digunakan):

| Nama | Tipe | Penggunaan |
| --- | --- | --- |
| `TLK_API_KEY` | **Secret** | Nilainya **persis sama** dengan `API_KEY` di Render service `tiktok-live-konektor` |
| `TLK_OVERLAY_TOKEN` | **Secret** | Token acak panjang, minimum 24 karakter, **berbeda** dari `TLK_API_KEY` |
| `TLK_BASE_URL` | Text (opsional) | Default `https://tiktok-live-konektor.onrender.com` |

Jangan menyimpan secret di GitHub, file publik, `index.html`, atau JavaScript frontend. Jangan menjadikan `API_KEY` konektor sebagai token overlay.

**Di Render (service `tiktok-live-konektor`)**: set `API_KEY`, cek `GET /api/health`, dan klik **Start LIVE** saat akun TikTok benar-benar LIVE. Backend-to-backend dari Cloudflare tidak memerlukan `API_ALLOWED_ORIGINS` karena tidak mengirim header `Origin` browser.

**Catatan domain:** Pada pemeriksaan 9 Oktober 2026, `numerology.muidsoft.com` masih terikat ke Pages project `numerologi-angka-hidup-deploy` yang memakai **repo lain**. Commit ke `numerologilive` tidak otomatis mengganti deployment website yang memakai repo lain. Hubungkan Pages project khusus ke repo ini terlebih dahulu; jangan pindahkan domain sebelum project baru lolos verifikasi.

## Desain premium LIVE Overlay

Overlay `/live.html` menggunakan tema *celestial luxury*: gerbang kosmik, kristal, aksen emas, kartu numerologi bercahaya, dan efek atmosfer yang dibuat dari SVG serta CSS lokal. Desain adaptif untuk **OBS portrait (9:16) maupun landscape (16:9)** dan menyediakan animasi yang mengikuti pengaturan *reduced motion*. Tidak memakai screenshot statis yang berisi angka atau teks palsu: semuanya tetap diperbarui oleh event asli.

**Pratinjau desain tanpa token maupun event TikTok:** buka `/live.html?preview=1`. Ini memakai sampel angka 7 dan username fiktif `@penonton_live`, diberi status PREVIEW (bukan indikator LIVE asli). Untuk mencoba background transparan gunakan `/live.html?preview=1&transparent=1`.

**Mode streaming sebenarnya:** buka `/live.html` lalu masukkan token overlay, atau pakai URL OBS dengan fragmen akses sesuai petunjuk di bawah. Gunakan `?transparent=1` apabila video TikTok menjadi latar belakang; dalam mode tersebut seluruh dekorasi background disembunyikan agar sumber video tetap terlihat, sementara kartu dan panel depan tetap premium.

## Menggunakan overlay OBS

1. Buka `https://<nama-project>.pages.dev/live.html` dan masukkan `TLK_OVERLAY_TOKEN`. Setelah tersambung, token disimpan hanya dalam **sessionStorage** browser tersebut.
2. Alternatif untuk Browser Source pribadi di OBS: `https://<nama-project>.pages.dev/live.html?transparent=1#access=TOKEN_OVERLAY_ANDA`. Fragmen URL (`#access=`) tidak dikirim ke server dan dibersihkan dari address bar saat halaman dimuat, namun token tetap tertulis dalam pengaturan OBS. **Jangan bagikan URL lengkap kepada publik.**
3. Komentar penonton dengan tanggal lahir (`16/11/1996`, `16 November 1996`, `16111996`) disimpan **sementara hanya di memori browser overlay**.
4. Hasil numerologi tampil setelah penonton yang sama mengirim **gift minimal 1 koin** atau mencapai **400 like kumulatif** dalam sesi overlay.
5. Ambang OBS dapat diatur untuk halaman tersebut dengan `?likes=400&gift=1`; `?transparent=1` untuk background transparan. Durasi tampil kartu default ±13 detik (`duration=13`).

**Catatan Smart Parser:** Hanya komentar yang mengandung pola/indikasi tanggal lahir yang diproses; komentar biasa diabaikan. Format 2 digit tidak selalu bisa membedakan kelahiran abad lalu: 96 → 1996 dan 05 → 2005, jadi gunakan tahun 4 digit jika ragu. Jika satu pesan memuat dua tanggal berbeda, sistem meminta penonton mengulang dengan satu tanggal. Notifikasi hanya muncul di overlay (tidak mengirim balasan TikTok) dan dapat diubah di Admin. Tanggal yang salah membatalkan tanggal sebelumnya untuk akun tersebut, sehingga gift/like tidak memakai tanggal yang salah. Data tanggal lahir tetap hanya di memori OBS.
 
**Batasan:** Ini *polling* history konektor (hingga 200 event terbaru per request), **bukan** push realtime atau delivery tepat sekali. History konektor hanya dalam memori Render. Buka overlay **sebelum** menerima komentar; saat overlay mulai, history lama sengaja dilewatkan agar hadiah lama tidak memicu ramalan ulang. Restart overlay menghapus tanggal lahir dan jumlah like yang belum diproses. Jika memerlukan persistence dan keandalan tinggi saat traffic padat, integrasi webhook + D1 dan idempotency harus ditambahkan di fase berikutnya.

## Endpoints

| Endpoint Cloudflare | Akses | Fungsi |
| --- | --- | --- |
| `GET /api/tiktok/status` | Publik | Status LIVE dan statistik agregat yang aman |
| `GET /api/tiktok/stats` | Publik | Statistik agregat (tanpa identitas top gifter) |
| `GET /api/tiktok/events` | **Bearer TLK_OVERLAY_TOKEN** | Event terproteksi bagi overlay; maksimum 200 |

Semua upstream request memakai `Authorization: Bearer TLK_API_KEY` dari Pages Functions, `Cache-Control: no-store`, dan tidak mengikuti redirect. API menyediakan **read-only**: menyalakan LIVE tetap dari dashboard konektor.

## Pengujian

```bash
node --test tests/
node --check live-overlay.mjs
node --check live-engine.mjs
```

Unit test meliputi kalkulator, parser tanggal lahir LIVE, pemicu gift/like, serta autentikasi proxy dan penanganan kegagalan API.


## Panel admin tanpa D1 (Cloudflare R2 JSON)

Buka **`/admin.html`** pada deployment Pages khusus repo ini. Panel menyediakan:
- Pilih beberapa konteks bacaan: umum, cinta, karier, kekuatan, tantangan, atau saran.
- Atur minimum koin gift dan like kumulatif, aktif/nonaktif pemicu, dan durasi tampilan kartu.
- Edit nama brand, judul/deskripsi layar tunggu, dan disclaimer.
- Tampilkan/sembunyikan nama penonton, nomor, judul, label gift/like, petunjuk, dan catatan.
- Pratinjau di browser melalui `/live.html?preview=1` tanpa event TikTok asli.
- Smart Date Parser untuk komentar LIVE: mode fleksibel (DD/MM/YYYY, DD-MM-YY, DD MM YY, nama bulan, YYYY-MM-DD, DDMMYYYY, DDMMYY (jika seluruh komentar atau disertai kata lahir/tgl), atau `tgl 16 bulan 11 tahun 96`) dan mode ketat (wajib DD/MM/YYYY).
- Koreksi tahun dua digit 96 → 1996 (mengikuti tahun berjalan), validasi tanggal kalender, serta penolakan tanggal ambigu, mustahil, dan masa depan. **Tanggal tidak pernah ditebak atau ditukar hari/bulan.**
- Atur notifikasi overlay bila komentar mirip tanggal lahir tetapi salah/tidak lengkap, jeda anti-spam 10–180 detik per akun (ditambah batas global 4 detik), dan contoh tanggal pada layar tunggu.
- Gunakan fitur **Uji Parser** dalam Admin untuk simulasi komentar sebelum LIVE; tidak mengirim komentar atau tanggal lahir ke server.

**Tidak menggunakan D1, KV, ataupun layanan listener baru.** Pengaturan disimpan sebagai **satu objek JSON** `settings/overlay.json` pada bucket R2 privat melalui binding Cloudflare Pages Functions. Overlay mengakses konfigurasi publik yang sudah disanitasi dari `GET /api/overlay-config`; token admin tidak diekspos. Perubahan diambil oleh overlay setiap sekitar 30 detik, lalu berlaku untuk pembacaan berikutnya. Query OBS `?likes=`, `?gift=`, `?duration=` tetap dapat dipakai untuk override khusus sumber OBS.

### Konfigurasi (wajib untuk menyimpan)

1. Cloudflare → R2 Object Storage → buat bucket privat, misalnya `numerologilive-config`. Tidak perlu menyalakan public bucket URL.
2. Di **Pages project yang terhubung dengan repo `numerologilive`**, buka Settings → Bindings → Add → **R2 bucket**. Pilih bucket tersebut dan gunakan nama binding **`NUMEROLOGY_CONFIG_R2`**. Pasang untuk Production (dan Preview bila perlu).
3. Settings → Variables and Secrets → tambahkan secret **`NUMEROLOGY_ADMIN_TOKEN`** yang benar-benar acak, panjang 2–512 karakter (**32+ karakter sangat disarankan untuk produksi**). Token 2 karakter sangat mudah ditebak: jangan gunakan pada admin publik tanpa perlindungan tambahan seperti Cloudflare Access dan aturan pembatasan percobaan login (WAF). **Berbeda** dari `TLK_API_KEY` dan `TLK_OVERLAY_TOKEN`. Jangan simpan nilainya di GitHub atau URL OBS.
4. Pastikan `TLK_API_KEY` dan `TLK_OVERLAY_TOKEN` tetap dikonfigurasi seperti sebelumnya. Deploy ulang Pages setelah menambah binding/secret.
5. Kunjungi `/admin.html`, masukkan token admin, atur opsi, lalu klik **Simpan ke R2**. Bila file JSON belum ada, backend memberikan nilai default; save pertama membuatnya.

Admin API: `GET/PUT /api/admin/settings` membutuhkan `Authorization: Bearer NUMEROLOGY_ADMIN_TOKEN`, membatasi ukuran payload, dan tidak menyediakan CORS publik. Jangan memasang cache atau proxy publik di depan endpoint admin. Sebagai lapisan tambahan, disarankan membatasi `/admin.html` dan `/api/admin/*` melalui Cloudflare Access; kode tetap memverifikasi token meski Access tidak dikonfigurasi.

**Catatan deployment:** README lama menyatakan domain `numerology.muidsoft.com` masih terikat ke Pages project dari repo lain. Fitur admin belum otomatis muncul di domain tersebut sampai Pages yang benar dipasang. Pengaturan konektor masih dikelola via Cloudflare secret; panel ini **tidak mengubah API key di runtime**.

## Privasi dan catatan produk

Kalkulasi situs utama tetap dilakukan di browser; tanggal lahir yang diisikan ke kalkulator utama tidak dikirim ke server. Untuk LIVE, **komentar berasal dari TikTok** dan konektor pusat menyimpan history event sementara dalam memori server; overlay tidak mengirim atau menyimpan ulang tanggal lahir ke database website. Hasil numerologi untuk hiburan dan refleksi, bukan ramalan pasti atau diagnosis.

## Webhook LIVE (admin copy URL)
Set `NUMEROLOGY_WEBHOOK_SECRET` as a separate random 32+ character Cloudflare Pages secret.
After admin login, `/admin.html` retrieves the complete protected webhook URL through
`GET /api/admin/webhook-url`. Click **Salin URL** and paste into TikTok LIVE Konektor →
Integrasi Webhook (POST JSON, events `chat`, `like`, `gift`).
The receiver `POST /api/tiktok/webhook?secret=...` validates the token before
writing time-bounded event objects to the private `NUMEROLOGY_CONFIG_R2` bucket.
The OBS overlay reads those through a distinct bearer-protected GET on the same route
and keeps its existing TikTok connector polling as fallback. Do not publish the URL.
Webhook payloads currently have no HMAC signature, so keep its secret long and rotate
if exposed. Consider adding R2 lifecycle expiration for `webhook-events/` objects.
