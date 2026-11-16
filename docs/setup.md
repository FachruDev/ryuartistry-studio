# Setup & Operasional (Fase 0–3)

## Komponen

| Path | Isi |
|---|---|
| `app/api/mcp/route.ts` | Endpoint MCP (Streamable HTTP, stateless). Token Bearer menentukan peran dan tools yang terlihat |
| `lib/mcp/server.ts`, `lib/mcp/tools-research.ts`, `lib/mcp/helpers.ts` | Daftar tools per peran (riset Rina dipisah) |
| `lib/studio/playbooks.ts` | Instruksi shift per agen (tool `get_playbook`) |
| `lib/studio/workflow.ts` | Aturan alur murni (batas revisi, routing, fallback siklus) + test |
| `lib/studio/rubrics.ts`, `rubrics/*.json` | Rubrik penilaian dan perhitungan skor di server + test |
| `lib/studio/adobe.ts` | Aturan metadata Adobe Stock, nama file, ekspor CSV + test |
| `lib/studio/image-inspect.ts` | Membaca format/ukuran/ruang warna gambar dan dHash (sharp) |
| `lib/studio/auto-check.ts` | Cek teknis aset |
| `lib/studio/research-periods.ts` | Kalender studio (WIB): slot riset, periode harian/mingguan (Senin-Minggu)/bulanan/tahunan + test |
| `lib/studio/research-rollup.ts` | Agregasi topik, skor peluang, tren, performa per keyword + test |
| `lib/studio/performance-csv.ts` | Parser CSV penjualan (kolom fleksibel) + test |
| `lib/studio/service/` | Semua operasi job: `core` (helper), `pipeline` (Shion/Lukas), `execution` (Linda/Kechlyn), `publishing` (metadata, approval, kit Adobe, kalibrasi), `research` (sesi & laporan Rina, dashboard), `research-insights` (daily merge, rollup, jadwal, impor performa) |
| `lib/db/schema.ts`, `drizzle/` | Skema Postgres dan migrasi |
| `lib/storage.ts` | S3 (bucket privat, URL presigned) |
| `app/dashboard` | Panel admin (sidebar + topbar, tema terang/gelap): Ringkasan, Adobe Stock, Reels, Riset, Performa |
| `app/login`, `lib/auth/` | Halaman login dan sesi cookie bertanda tangan + test |
| `lib/studio/video-probe.ts`, `lib/studio/video-inspect.ts` | Membaca reels dengan ffprobe/ffmpeg (codec, durasi, loudness, keyframe) + test |
| `lib/studio/reels.ts` | Aturan storyboard dan metadata reels + test |
| `app/dashboard/kit/adobe-csv` | Unduhan CSV metadata untuk Adobe Stock |
| `scripts/seed-agents.ts` | Membuat agen dan token |
| `scripts/smoke-test.ts` | Uji end-to-end alur gambar Adobe lewat MCP |
| `scripts/smoke-research.ts` | Uji end-to-end riset Rina, rollup, dan impor performa lewat MCP |

## Environment

| File | Isi | Di git? |
|---|---|---|
| `.env` | `DATABASE_URL`, kredensial S3 (`AWS_*`), opsional `S3_BUCKET_PRIVATE` (default `storage-private`) | Tidak |
| `.env.local` | `STUDIO_DASHBOARD_USER`, `STUDIO_DASHBOARD_PASSWORD` (akun login), `STUDIO_SESSION_SECRET` (kunci tanda tangan cookie, minimal 32 karakter), `STUDIO_REELS_NICHE` (niche kanal Facebook), opsional `FFMPEG_PATH` / `FFPROBE_PATH` | Tidak |
| `.env.agents.local` | Token setiap agen (`STUDIO_TOKEN_SHION`, dst.) | Tidak |

**Server butuh `ffmpeg` dan `ffprobe`** (untuk membaca reels: codec, durasi, loudness, keyframe). Di Windows: `winget install Gyan.FFmpeg`; di Linux: paket `ffmpeg`.

Mengganti `STUDIO_SESSION_SECRET` membuat semua sesi login tidak berlaku (semua orang harus masuk lagi).

Token disimpan di database hanya sebagai hash sha256. Siapa pun yang memegang token bisa bertindak sebagai agen tersebut, jadi simpan file token dengan aman.

## Perintah

```bash
bun run db:generate        # buat migrasi setelah mengubah lib/db/schema.ts
bun run db:migrate         # terapkan migrasi ke DATABASE_URL
bun run agents:seed        # buat agen yang belum ada
bun run agents:seed -- --rotate   # ganti semua token
bun test                   # unit test aturan alur, rubrik, metadata Adobe
bun run build && bun run start
```

Uji end-to-end (server harus berjalan; data uji dihapus otomatis):

```bash
bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-test.ts http://localhost:3000
```

```bash
bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-research.ts http://localhost:3000
```

```bash
bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-reels.ts http://localhost:3000
```

`smoke-test` = alur gambar Adobe, `smoke-research` = riset Rina, `smoke-reels` = alur reels dengan video MP4 asli buatan ffmpeg plus login dashboard.

`KEEP=1` membiarkan data uji agar bisa dilihat di dashboard; hapus dengan `--cleanup <cycleId,...>` yang dicetak di akhir.

## Menghubungkan agen

URL MCP: `https://<domain>/api/mcp` dengan header `Authorization: Bearer <token agen>`.

Contoh konfigurasi klien yang mendukung remote MCP via HTTP (format bervariasi per aplikasi):

```json
{
  "mcpServers": {
    "ryuartistry-studio": {
      "type": "http",
      "url": "https://<domain>/api/mcp",
      "headers": { "Authorization": "Bearer <STUDIO_TOKEN_SHION>" }
    }
  }
}
```

Aplikasi chat seperti ChatGPT dan Claude.ai butuh server yang dapat diakses publik (bukan `localhost`), jadi agen baru bisa terhubung setelah server di-deploy atau diekspos lewat tunnel.

Prompt terjadwal untuk setiap agen cukup: **"Panggil get_playbook lalu jalankan satu shift."** Playbook berisi langkah lengkap per peran.

## Alur gambar Adobe Stock (Fase 1)

1. **Rina** menerbitkan laporan harian → server membuka 5 siklus (`CYCLES_PER_DAILY_REPORT`).
2. **Shion → Lukas**: ide dan review dengan rubrik `idea`.
3. **Linda** upload JPEG. Server membaca file langsung dan menolak bila:
   - bukan JPEG (dicek dari isi file, bukan nama/content type), bukan sRGB;
   - di luar 4–100 MP atau lebih dari 45 MB;
   - terlalu mirip aset lain di platform yang sama (dHash, jarak ≤ 6 dari 64 bit).
4. **Kechlyn** menilai dengan rubrik `asset-image`, lalu menyiapkan metadata. Server memvalidasi aturan CSV Adobe: judul ≤ 70 karakter tanpa koma, 5–49 keyword unik (dinormalisasi huruf kecil), kategori angka 1–21, tanpa nama tool AI. Nama file (≤ 30 karakter) dibuat server.
5. **Kamu** di dashboard: setujui/tolak dengan skor 1–10 (untuk kalibrasi).
6. **Kit upload**: unduh file (sudah bernama sesuai CSV) dan CSV metadata, upload ke portal contributor, centang *Created using generative AI tools*, lalu tandai "sudah diupload".
7. **Hasil Adobe**: catat diterima/ditolak. Penolakan mengarsipkan job, masuk `idea_graveyard`, dan tampil sebagai `platformRejections` di konteks semua agen berikutnya.

Panel **Kalibrasi** membandingkan skor Kechlyn dengan skormu dan melacak syarat mode otomatis (`AUTO_MODE_CRITERIA`: ≥ 50 dinilai, ≥ 90% disetujui, ≥ 80% diterima Adobe).

## Riset Rina (Fase 2)

Semua tanggal memakai zona waktu studio **Asia/Jakarta (WIB)**. Slot riset: 1 pagi (00–11), 2 siang (12–17), 3 malam (18–23). Minggu = Senin–Minggu.

1. **Setiap shift** Rina memanggil `get_research_schedule`. Server mengembalikan daftar `due`: slot yang belum diisi, laporan harian yang belum terbit (termasuk kemarin), dan rollup yang jatuh tempo (periode sebelumnya yang belum dirangkum, atau periode berjalan pada hari terakhirnya).
2. **Sesi riset** (`submit_research_session`): satu sesi per model per slot, jadi Claude dan Grok bisa mengisi slot yang sama. Sesi ganda ditolak.
3. **Laporan harian**: `get_daily_merge_data` menggabungkan topik lintas sesi/model secara deterministik dan memberi skor:
   - `opportunityScore = permintaan × (11 − persaingan) / 10 × keyakinan / 10` (0–10);
   - keyakinan naik +0,5 per sesi tambahan dan +1 per model tambahan; topik tanpa sumber dibatasi maksimal 5;
   - tren dibandingkan dengan 7 hari sebelumnya.
   Rina memilih peluang dan menerbitkan dengan `publish_report` (wajib berisi `opportunities`). Laporan harian membuka 5 siklus produksi.
4. **Rollup**: `get_rollup_data` menghitung topik dari data mentah periode itu (bukan dari ringkasan), tren naik/turun/baru/hilang dibanding periode sebelumnya, dan performa per keyword. Server memvalidasi periode harus pas kalender, hanya satu laporan per periode, dan `child_report_ids` harus laporan level di bawahnya di dalam periode.
5. **Performa**: impor CSV penjualan di dashboard (halaman Performa) atau lewat tool admin `import_performance_csv`. Baris dicocokkan ke publikasi lewat nama file yang dibuat server; impor ulang hari yang sama menimpa. Kolom dikenali secara fleksibel (filename / original filename, date / sale date, downloads / quantity, revenue / earnings / royalty); CSV dengan pemisah `;` membaca koma sebagai desimal.

## Reels Facebook (Fase 3)

1. **Ide → storyboard.** Setelah ide lolos Lukas, Shion mengirim storyboard. Server menolaknya sebelum Lukas menilai bila: tidak ada hook, total durasi bukan 30–60 detik, scene pertama lebih dari 5 detik, atau ada scene tanpa visual / tanpa narasi dan teks layar. Lukas menilai dengan rubrik `storyboard` (maks 3 revisi).
2. **Produksi (Linda = Claude).** Upload MP4. Server membaca file dengan ffprobe/ffmpeg dan menolak bila: bukan MP4 H.264 + AAC, bukan 9:16 vertikal atau lebar < 1080 px, durasi di luar 30–60 detik, fps di luar 23–60, tanpa audio, loudness di luar −18…−10 LUFS (target −14), true peak di atas −1 dBTP, lebih dari 300 MB, atau terlalu mirip reel lain (dHash 3 keyframe).
3. **Review (Kechlyn).** Konteks job memuat URL video, **lembar 3 keyframe** (hook, tengah, akhir) untuk reviewer yang tidak bisa memutar video, dan fakta teknis (codec, fps, LUFS, true peak). Rubrik `asset-reel`.
4. **Metadata.** Caption wajib (maks 2200 karakter), maksimal 10 hashtag (dinormalisasi menjadi `#tag` unik), label AI wajib. Nama file dibuat server.
5. **Approval → kit posting** di halaman **Reels**: unduh video, salin caption + hashtag, posting lewat Meta Business Suite / aplikasi Facebook dengan label AI aktif, lalu tempel link reel (hanya `facebook.com` / `fb.watch`). Status menjadi terbit.
6. **Dibatasi Meta** (dihapus, dibatasi, tidak dimonetisasi): catat alasannya. Job diarsipkan dan alasannya masuk `platformRejections` semua agen.
7. **Performa reels:** impor ekspor Meta di halaman Performa (tab Facebook Reels). Baris dicocokkan lewat link postingan (beda subdomain `m.`/`www.` atau query string tetap cocok), dengan kolom `views` / `plays` dan `estimated earnings`.

**Niche kanal** (`STUDIO_REELS_NICHE`) wajib diisi sebelum produksi berjalan: Meta menurunkan monetisasi konten yang tidak orisinal dan diproduksi massal, jadi semua reel harus konsisten pada satu tema. Niche ditampilkan ke Rina dan Shion di konteks job.

## Dashboard

Panel admin dengan **sidebar** (Ringkasan · Produksi: Adobe Stock, Reels · Wawasan: Riset, Performa, lengkap dengan badge jumlah yang menunggu, tim agen, dan akun/keluar) dan **topbar** (judul halaman, peringatan siklus berhenti, ganti tema). Di layar kecil sidebar menjadi drawer dari tombol menu (Esc untuk menutup).

- **Ringkasan**: KPI (pendapatan 30 hari kedua platform), approval lintas platform, siklus berhenti, pipeline, aktivitas.
- **Adobe Stock**: kit upload + CSV, hasil moderasi, kalibrasi.
- **Reels**: kit posting, reel terbit, kalibrasi.
- **Riset** dan **Performa**: tab platform di URL (`?platform=facebook_reels`).

**Login** di `/login` (desain terpisah, dua tema). Sesi berupa cookie bertanda tangan HMAC (`httpOnly`, `sameSite=lax`, `secure` di produksi) berlaku 7 hari; 5 kali salah dalam 15 menit mengunci percobaan dari alamat yang sama. Semua server action dan rute CSV memeriksa sesi lagi; tujuan setelah login (`?next=`) hanya boleh ke `/dashboard…`.

Tema terang dan gelap: mengikuti pengaturan sistem pada kunjungan pertama, bisa diganti dengan tombol di topbar (disimpan di `localStorage`, `theme-color` ikut berubah). Semua warna berasal dari token CSS di `app/globals.css`; warna data grafik sudah divalidasi untuk kedua tema (kontras dan aman untuk buta warna).

## Batasan saat ini

- Format ekspor performa Meta yang sebenarnya belum diuji dengan file asli; parser menerima beberapa variasi nama kolom.
- Posting ke Facebook masih manual lewat Meta; publikasi otomatis lewat Graph API butuh aplikasi Meta yang disetujui (Fase 4).
- Batas login disimpan di memori server; dengan beberapa instance server, gunakan penyimpanan bersama.
- Penggabungan topik memakai nama topik yang dinormalisasi (huruf kecil, tanpa tanda baca). Topik dengan kata berbeda tetapi bermakna sama tidak digabung otomatis; Rina sebaiknya memakai nama topik yang konsisten.
- Format CSV penjualan Adobe yang sebenarnya belum diuji dengan file asli; parser menerima beberapa variasi nama kolom, tetapi cocokkan sekali dengan ekspor dari portal.
- Tidak ada upload otomatis ke Adobe/Facebook. Adobe Stock menyediakan upload file lewat SFTP untuk contributor; otomatisasi upload file bisa ditambahkan nanti, sedangkan metadata tetap lewat CSV di portal.
- Daftar kategori Adobe (`ADOBE_CATEGORIES`) diambil dari daftar kategori contributor; cocokkan dengan portal bila Adobe mengubahnya.
- Cek duplikat memindai semua hash aset di platform (linear); cukup untuk ribuan aset.
- Anggaran biaya baru dicatat (`report_cost`), belum menghentikan job secara otomatis.
