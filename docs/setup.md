# Setup & Operasional (Fase 0–4)

## Komponen

| Path | Isi |
|---|---|
| `app/api/mcp/route.ts` | Endpoint MCP (Streamable HTTP, stateless). Token Bearer menentukan peran dan tools yang terlihat |
| `lib/mcp/server.ts`, `lib/mcp/tools-research.ts`, `lib/mcp/tools-scout.ts`, `lib/mcp/helpers.ts` | Daftar tools per peran (riset Rina dan pindaian Rina-Scout dipisah) |
| `lib/studio/playbooks.ts` | Instruksi shift per agen (tool `get_playbook`) |
| `lib/studio/workflow.ts` | Aturan alur murni (batas revisi, routing, fallback siklus) + test |
| `lib/studio/rubrics.ts`, `rubrics/*.json` | Rubrik penilaian dan perhitungan skor di server + test |
| `lib/studio/adobe.ts` | Aturan metadata Adobe Stock, nama file, ekspor CSV + test |
| `lib/studio/image-inspect.ts` | Membaca format/ukuran/ruang warna gambar dan dHash (sharp) |
| `lib/studio/auto-check.ts` | Cek teknis aset |
| `lib/studio/research-periods.ts` | Kalender studio (WIB): slot riset, periode harian/mingguan (Senin-Minggu)/bulanan/tahunan + test |
| `lib/studio/research-rollup.ts` | Agregasi topik, skor peluang, tren, performa per keyword + test |
| `lib/studio/performance-csv.ts` | Parser CSV penjualan (kolom fleksibel) + test |
| `lib/studio/service/` | Semua operasi job: `core` (helper), `pipeline` (Shion/Lukas), `execution` (Linda/Kechlyn), `publishing` (metadata, approval, kit Adobe, kalibrasi), `research` (sesi & laporan Rina, dashboard), `research-insights` (daily merge, rollup, jadwal, impor performa), `scout` (pindaian tren Rina-Scout) |
| `lib/db/schema.ts`, `drizzle/` | Skema Postgres dan migrasi |
| `lib/storage.ts` | S3 (bucket privat, URL presigned) |
| `app/dashboard` | Panel admin (sidebar + topbar, tema terang/gelap): Ringkasan, Adobe Stock, Reels, Riset, Performa |
| `app/login`, `lib/auth/` | Halaman login dan sesi cookie bertanda tangan + test |
| `lib/studio/automation.ts`, `lib/studio/service/automation.ts`, `lib/db/schema-automation.ts` | Pengaturan, anggaran, publikasi otomatis, heartbeat, notifikasi, cron + test |
| `lib/studio/agent-kit.ts` | Jadwal dan prompt terjadwal per agen |
| `app/api/cron/tick` | Endpoint cron pengecekan berkala |
| `scripts/smoke-automation.ts` | Uji end-to-end otomasi |
| `lib/oauth/`, `app/oauth/`, `app/.well-known/` | OAuth 2.1 untuk MCP: discovery, pendaftaran klien, persetujuan (pilih agen), token + test |
| `scripts/smoke-oauth.ts` | Uji end-to-end OAuth (discovery → token → MCP → rotasi → cabut) |
| `lib/studio/video-probe.ts`, `lib/studio/video-inspect.ts` | Membaca reels dengan ffprobe/ffmpeg (codec, durasi, loudness, keyframe) + test |
| `lib/studio/reels.ts` | Aturan storyboard dan metadata reels + test |
| `app/dashboard/kit/adobe-csv` | Unduhan CSV metadata untuk Adobe Stock |
| `scripts/seed-agents.ts` | Membuat agen dan token |
| `scripts/smoke-test.ts` | Uji end-to-end alur gambar Adobe lewat MCP |
| `scripts/smoke-research.ts` | Uji end-to-end pindaian Rina-Scout → riset Rina, rollup, dan impor performa lewat MCP |

## Environment

| File | Isi | Di git? |
|---|---|---|
| `.env` | `DATABASE_URL`, kredensial S3 (`AWS_*`), opsional `S3_BUCKET_PRIVATE` (default `storage-private`) | Tidak |
| `.env.local` | `CRON_SECRET` (untuk `/api/cron/tick`), `STUDIO_SESSION_SECRET` (kunci tanda tangan cookie, minimal 32 karakter), `STUDIO_REELS_NICHE` (niche kanal Facebook), opsional `FFMPEG_PATH` / `FFPROBE_PATH` | Tidak |
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

`smoke-test` = alur gambar Adobe, `smoke-research` = pindaian + riset, `smoke-reels` = alur reels dengan video MP4 asli buatan ffmpeg plus login dashboard.

**Penting:** `smoke-test`, `smoke-reels`, dan `smoke-automation` mengambil job lewat `get_next_job`, yang selalu mengambil job tertua di database. Ketiganya menolak jalan bila ada job nyata di antrian. Setelah studio berjalan sungguhan, jalankan uji ini di branch Neon terpisah (`DATABASE_URL` branch uji), bukan di database production.

`KEEP=1` membiarkan data uji agar bisa dilihat di dashboard; hapus dengan `--cleanup <cycleId,...>` yang dicetak di akhir.

## Menghubungkan agen

URL MCP:

- **Per agen** (disarankan): `https://<domain>/api/mcp/<agen>` dengan `<agen>` = `rina-scout`, `rina`, `shion`, `lukas`, `linda`, `kechlyn`. Aplikasi seperti Claude hanya mengizinkan satu konektor per URL, jadi URL per agen memungkinkan satu aplikasi memegang beberapa agen. URL menentukan agennya: layar persetujuan hanya menawarkan agen itu, token OAuth hanya berlaku di URL itu, dan token statis agen lain ditolak.
- **Bersama**: `https://<domain>/api/mcp`. Agen dipilih di layar persetujuan (atau ditentukan token statis).

Ada dua cara masuk, keduanya lewat HTTPS dan `Authorization: Bearer`:

### 1. OAuth 2.1 — untuk aplikasi chat (Claude.ai, ChatGPT, Gemini app, Grok)

Tempel URL MCP sebagai konektor custom; biarkan pengaturan OAuth kosong. Alurnya mengikuti spesifikasi otorisasi MCP:

1. Server menjawab `401` dengan `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/api/mcp"`.
2. Aplikasi membaca metadata resource (RFC 9728) dan authorization server (`/.well-known/oauth-authorization-server`, RFC 8414).
3. Aplikasi mendaftar sendiri lewat `/oauth/register` (Dynamic Client Registration, RFC 7591) atau memakai Client ID Metadata Document (client_id berupa URL HTTPS).
4. Browser dibuka ke `/oauth/authorize`: kamu login ke studio, lalu menyetujui agen dari URL konektor (URL bersama: **memilih agen**) (mis. Grok → Rina-Scout, Claude.ai → Rina, ChatGPT → Shion). Aplikasi hanya melihat tools agen tersebut.
5. Token: PKCE S256 wajib; access token 1 jam, refresh token 30 hari dan **berotasi**; token terikat ke URL MCP ini (RFC 8707). Refresh token yang dipakai ulang atau kode yang dipakai dua kali mencabut seluruh koneksi itu.
6. Cabut kapan saja: halaman **Agen** → kit koneksi agen → tombol **Cabut** (atau aplikasi memanggil `/oauth/revoke`).

Semua token, kode, dan secret klien disimpan hanya sebagai hash sha256. Isi `STUDIO_PUBLIC_URL` (mis. `https://studio.domainmu.com`) di production agar URL issuer/resource tetap, tidak bergantung header permintaan.

### 2. Token statis — untuk klien yang bisa mengatur header

Claude Code, Gemini CLI, dan API xAI (Remote MCP) bisa memakai token agen dari kit koneksi (`Authorization: Bearer rs_<peran>_…`). Ganti token dari halaman Agen bila bocor.

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

## Riset: Rina-Scout + Rina

Semua tanggal memakai zona waktu studio **Asia/Jakarta (WIB)**. Slot: 1 pagi (00–11), 2 siang (12–17), 3 malam (18–23). Minggu = Senin–Minggu.

Riset dikerjakan dua agen dengan token/koneksi sendiri:

| Agen | Aplikasi | Jadwal | Tugas |
|---|---|---|---|
| **Rina-Scout** | Grok | 06.30, 12.30, 18.30 WIB | `submit_trend_scan`: 3–15 sinyal yang sedang naik per slot (topik, alasan, keyword, momentum, sumber). Tidak bisa menyimpan riset atau menerbitkan laporan. |
| **Rina** | Claude | 20.00 WIB | Riset mendalam dari pindaian hari itu, laporan harian, dan rollup. Hanya hasil Rina yang menjadi laporan resmi. |

1. **Setiap shift** kedua agen memanggil `get_research_schedule`; server hanya mengembalikan tugas milik peran itu. Scout: `trend_scan` per slot yang belum dipindai. Rina: `deep_research` (setelah ada pindaian hari itu, atau mulai slot malam tanpa pindaian), `publish_daily`, dan rollup. Riset atau laporan kemarin yang tertinggal ikut muncul.
2. **Riset mendalam** (`submit_research_session`): Rina membaca `get_trend_scans`, memverifikasi permintaan dan persaingan tiap sinyal, membuang yang tidak layak jual, dan menambah temuannya sendiri. Satu sesi per model per slot; sesi ganda ditolak. Pindaian hanya boleh untuk hari ini atau kemarin.
3. **Laporan harian**: `get_daily_merge_data` menggabungkan topik lintas sesi/model secara deterministik dan memberi skor:
   - `opportunityScore = permintaan × (11 − persaingan) / 10 × keyakinan / 10` (0–10);
   - keyakinan naik +0,5 per sesi tambahan dan +1 per model tambahan;
   - topik riset yang juga terlihat di pindaian (nama topik sama, atau ≥ 2 keyword sama) mendapat +1 keyakinan, +1,5 bila di 2+ pindaian (`scanSupport`); pindaian sendiri tidak pernah menjadi topik;
   - topik tanpa sumber dibatasi maksimal 5;
   - `scanSignalsNotResearched` mencantumkan sinyal pindaian yang tidak diriset;
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

## Otomasi (Fase 4)

Otomasi tetap berbasis MCP: setiap agen berjalan sebagai **scheduled task** di aplikasi chat-nya dan memanggil server. Server mengawasi, membatasi biaya, dan memberi tahu.

1. **Hubungkan agen** di halaman **Agen**. Tiap agen punya kit koneksi: URL MCP, jadwal yang disarankan, dan prompt terjadwal yang tinggal ditempel (prompt pendek; isi kerjanya diambil dari `get_playbook`). Token bisa diganti dari halaman itu (token lama langsung mati, token baru tampil sekali).
2. **Heartbeat.** Setiap permintaan MCP mencatat waktu terakhir agen aktif dan tool yang dipanggil. Agen tanpa aktivitas lebih dari `agentQuietHours` ditandai tidak aktif.
3. **Anggaran** (halaman **Pengaturan**):
   - batas harian per platform (hari studio, WIB): bila terlewati, `get_next_job` tidak memberikan job platform itu dan menjelaskan alasannya;
   - batas per job: `report_cost` menghentikan job (`halted`) yang melewati batas dan membuat notifikasi kritis.
4. **Publikasi otomatis** per platform: hanya berlaku bila sakelar aktif **dan** syarat kalibrasi tercapai saat itu (≥ 50 keputusan manusia, ≥ 90% disetujui, ≥ 80% diterima platform). Item yang disetujui otomatis ditandai `autoApproved` dan tidak dihitung sebagai keputusan manusia di statistik kalibrasi. Bila kalibrasi turun, approval manual otomatis berlaku lagi.
5. **Cron** `GET /api/cron/tick` dengan `Authorization: Bearer <CRON_SECRET>`, tiap 15–30 menit. Mengecek: job macet di tahap agen, agen tidak aktif, slot riset terlewat, anggaran habis, siklus berhenti, kalibrasi siap mode otomatis, dan approval yang menunggu lebih dari sehari. Setiap masalah jadi notifikasi sekali saja (kunci dedupe), plus webhook HTTPS opsional (Discord/Slack) untuk peringatan dan kritis. Tombol "Jalankan Pengecekan Sekarang" di halaman Agen melakukan hal yang sama.

## Pemicu agen (webhook)

Selain jadwal di dalam aplikasi AI, studio bisa membangunkan agen sendiri. Atur di halaman **Agen** → kartu agen → **Pemicu otomatis**: URL webhook, signing secret (opsional), dan jam jalan (WIB).

- Cron tick (`/api/cron/tick`, tiap 15–30 menit) mengecek jam jalan tiap agen. Pada jam itu studio mengirim `POST` JSON bertanda tangan [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<HMAC-SHA256>`).
- Agen hanya dibangunkan bila ada pekerjaan (jadwal riset untuk Rina-Scout/Rina, antrian job untuk yang lain). Setiap jam jalan dikirim paling banyak sekali; jam yang terlewat lebih dari 3 jam tidak dikirim.
- Isi payload: `agent`, `run`, `day`, `scheduledFor`, `mcpUrl` (URL MCP khusus agen, butuh `STUDIO_PUBLIC_URL`), `instruction`, dan `due` (daftar pekerjaan).
- Secret disimpan terenkripsi (AES-256-GCM, kunci dari `STUDIO_SESSION_SECRET`). Mengganti `STUDIO_SESSION_SECRET` membuat secret harus diisi ulang.
- Pengiriman gagal muncul sebagai notifikasi. Riwayat 6 pengiriman terakhir ada di kartu agen; **Kirim Uji** mengirim satu pemicu sekarang.

**Grok (Rina-Scout).** Di grok.com buat Automation dengan konektor MCP `…/api/mcp/rina-scout` dan prompt dari kit Rina-Scout, lalu tambahkan pemicu webhook. Salin URL webhook dan secret `whsec_…` ke form pemicu, jam `06:30, 12:30, 18:30`. Jadwal internal Automation tidak perlu diaktifkan.

**Claude (Rina, Lukas, Kechlyn, Linda reels).** Pakai routine Claude Code (claude.ai/code → scheduled tasks): buat tugas dengan prompt dari kit agen dan konektor MCP agen itu, lalu tambahkan trigger **API** dan klik Generate token. Isi form pemicu dengan Fire URL (`https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`) dan token `sk-ant-oat01-…` di kolom secret. Studio mengenali URL ini dan mengirim `Authorization: Bearer <token>` + `anthropic-version` dengan body `{"text": "<payload JSON>"}`; run menerimanya sebagai blok `<routine-fire-payload>`. Token hanya tampil sekali dan Generate ulang mencabut token lama. Batas Anthropic: 30 fire per tugas per jam.

**Aplikasi lain.** ChatGPT dan Gemini (gemini.google.com) belum bisa dipicu dari luar (per November 2026). Untuk agen-agen itu, pemicu webhook bisa diarahkan ke n8n/Make/Zapier yang memanggil API model, atau tetap memakai jadwal di aplikasinya.

## Alur harian dan hasil kerja

- **Alur harian** (`/dashboard/flow`): tahap per hari dari pindai tren sampai terbit, dengan status selesai/berjalan/terhenti/menunggu, plus kalender sebulan (warna = hasil hari itu, garis = tahap terjauh, angka = siklus terbit/dibuka). Reels punya tahap storyboard tambahan.
- **Hasil kerja** (`/dashboard/outputs`): output tiap agen (pindaian, riset, laporan, ide, review, aset dengan pratinjau, metadata). Pilih satu agen, atau beberapa untuk dibandingkan per kolom; ada filter platform dan rentang 1/7/30 hari.

## Dashboard

Panel admin dengan **sidebar** dan **topbar**:

- **Sidebar**: Studio (Ringkasan) · Produksi (Adobe Stock, Reels) · Wawasan (Riset, Performa) · Otomasi (Agen, Pengaturan), dengan badge jumlah yang menunggu, tim agen, dan akun/keluar. Tombol panah menciutkannya menjadi **deret ikon** (pilihan disimpan dan diterapkan sebelum halaman tampil). Di layar kecil sidebar menjadi drawer dari tombol menu.
- **Topbar**: judul halaman, peringatan siklus berhenti, **menu notifikasi** (jumlah belum dibaca, 8 terbaru, tandai semua dibaca), ganti tema, dan **menu akun** (Agen & koneksi, Pengaturan otomasi, ganti tema, keluar). Menu bisa dipakai dengan keyboard: panah atas/bawah, Esc menutup, fokus kembali ke tombol.

Halaman:

- **Ringkasan**: KPI (pendapatan 30 hari kedua platform), approval lintas platform, siklus berhenti, pipeline, aktivitas.
- **Adobe Stock**: kit upload + CSV, hasil moderasi, kalibrasi.
- **Reels**: kit posting, reel terbit, kalibrasi.
- **Riset** dan **Performa**: tab platform di URL (`?platform=facebook_reels`).
- **Agen**: status, heartbeat, kit koneksi per agen, cron.
- **Pengaturan**: pemakaian anggaran hari ini, aturan otomasi, riwayat notifikasi.

**Login** di `/login` (desain terpisah, dua tema). **Akun disimpan di database** (tabel `users`, kata sandi di-hash dengan scrypt), bukan di env. Buat akun dengan `bun run user:create -- --username <nama> --password <sandi> --must-change` (tambahkan `--reset` untuk mereset kata sandi akun yang sudah ada). Sesi berupa cookie bertanda tangan HMAC (`httpOnly`, `sameSite=lax`, `secure` di produksi) berisi ID akun dan versi sesi, berlaku 7 hari; server memeriksa akunnya masih aktif dan versinya sama. **Ganti kata sandi** di menu akun → Akun & kata sandi; semua sesi lain langsung keluar. Akun dengan kata sandi awal diarahkan ke halaman itu dan melihat banner pengingat. Lima kali salah mengunci akun 15 menit (disimpan di database, jadi berlaku di semua instance Vercel). Tujuan setelah login (`?next=`) hanya boleh ke `/dashboard…`.

Tema terang dan gelap: mengikuti pengaturan sistem pada kunjungan pertama, bisa diganti dengan tombol di topbar (disimpan di `localStorage`, `theme-color` ikut berubah). Semua warna berasal dari token CSS di `app/globals.css`; warna data grafik sudah divalidasi untuk kedua tema (kontras dan aman untuk buta warna).

## Batasan saat ini

- Format ekspor performa Meta yang sebenarnya belum diuji dengan file asli; parser menerima beberapa variasi nama kolom.
- Posting ke Facebook dan upload ke Adobe tetap manual (lewat kit). Publikasi otomatis di studio berarti melewati approval manusia, bukan mengunggah ke platform: Graph API Meta butuh aplikasi yang disetujui Meta, dan Adobe hanya menyediakan SFTP + CSV.
- Biaya hanya sejauh yang dilaporkan agen lewat `report_cost`; agen yang tidak melapor tidak terhitung dalam anggaran.
- Dengan beberapa instance server, cron cukup dipanggil ke satu instance; dedupe notifikasi mencegah duplikat.
- Penggabungan topik memakai nama topik yang dinormalisasi (huruf kecil, tanpa tanda baca). Topik dengan kata berbeda tetapi bermakna sama tidak digabung otomatis; Rina sebaiknya memakai nama topik yang konsisten.
- Format CSV penjualan Adobe yang sebenarnya belum diuji dengan file asli; parser menerima beberapa variasi nama kolom, tetapi cocokkan sekali dengan ekspor dari portal.
- Tidak ada upload otomatis ke Adobe/Facebook. Adobe Stock menyediakan upload file lewat SFTP untuk contributor; otomatisasi upload file bisa ditambahkan nanti, sedangkan metadata tetap lewat CSV di portal.
- Daftar kategori Adobe (`ADOBE_CATEGORIES`) diambil dari daftar kategori contributor; cocokkan dengan portal bila Adobe mengubahnya.
- Cek duplikat memindai semua hash aset di platform (linear); cukup untuk ribuan aset.
- Anggaran biaya baru dicatat (`report_cost`), belum menghentikan job secara otomatis.
