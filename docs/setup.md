# Setup & Operasional (Fase 0–1)

## Komponen

| Path | Isi |
|---|---|
| `app/api/mcp/route.ts` | Endpoint MCP (Streamable HTTP, stateless). Token Bearer menentukan peran dan tools yang terlihat |
| `lib/mcp/server.ts` | Daftar tools per peran |
| `lib/studio/playbooks.ts` | Instruksi shift per agen (tool `get_playbook`) |
| `lib/studio/workflow.ts` | Aturan alur murni (batas revisi, routing, fallback siklus) + test |
| `lib/studio/rubrics.ts`, `rubrics/*.json` | Rubrik penilaian dan perhitungan skor di server + test |
| `lib/studio/adobe.ts` | Aturan metadata Adobe Stock, nama file, ekspor CSV + test |
| `lib/studio/image-inspect.ts` | Membaca format/ukuran/ruang warna gambar dan dHash (sharp) |
| `lib/studio/auto-check.ts` | Cek teknis aset |
| `lib/studio/service/` | Semua operasi job: `core` (helper), `pipeline` (Shion/Lukas), `execution` (Linda/Kechlyn), `publishing` (metadata, approval, kit Adobe, kalibrasi), `research` (Rina, dashboard) |
| `lib/db/schema.ts`, `drizzle/` | Skema Postgres dan migrasi |
| `lib/storage.ts` | S3 (bucket privat, URL presigned) |
| `app/dashboard` | Dashboard manusia: approval, kit upload Adobe, hasil review Adobe, kalibrasi, status pipeline |
| `app/dashboard/kit/adobe-csv` | Unduhan CSV metadata untuk Adobe Stock |
| `scripts/seed-agents.ts` | Membuat agen dan token |
| `scripts/smoke-test.ts` | Uji end-to-end alur gambar Adobe lewat MCP |

## Environment

| File | Isi | Di git? |
|---|---|---|
| `.env` | `DATABASE_URL`, kredensial S3 (`AWS_*`), opsional `S3_BUCKET_PRIVATE` (default `storage-private`) | Tidak |
| `.env.local` | `STUDIO_DASHBOARD_USER`, `STUDIO_DASHBOARD_PASSWORD` (login dashboard) | Tidak |
| `.env.agents.local` | Token setiap agen (`STUDIO_TOKEN_SHION`, dst.) | Tidak |

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

## Batasan saat ini

- Cek teknis reels masih memakai dimensi/durasi yang dilaporkan Linda (Fase 3: ffprobe).
- Tidak ada upload otomatis ke Adobe/Facebook. Adobe Stock menyediakan upload file lewat SFTP untuk contributor; otomatisasi upload file bisa ditambahkan nanti, sedangkan metadata tetap lewat CSV di portal.
- Daftar kategori Adobe (`ADOBE_CATEGORIES`) diambil dari daftar kategori contributor; cocokkan dengan portal bila Adobe mengubahnya.
- Cek duplikat memindai semua hash aset di platform (linear); cukup untuk ribuan aset.
- Rollup riset (mingguan/bulanan/tahunan) bisa disimpan lewat `publish_report`, tetapi belum ada jadwal otomatis.
- Anggaran biaya baru dicatat (`report_cost`), belum menghentikan job secara otomatis.
- Dashboard memakai HTTP Basic auth; cukup untuk satu orang, ganti dengan login sungguhan sebelum dipakai tim.
