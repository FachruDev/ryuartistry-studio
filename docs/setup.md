# Setup & Operasional (Fase 0)

## Komponen

| Path | Isi |
|---|---|
| `app/api/mcp/route.ts` | Endpoint MCP (Streamable HTTP, stateless). Token Bearer menentukan peran dan tools yang terlihat |
| `lib/mcp/server.ts` | Daftar tools per peran |
| `lib/studio/workflow.ts` | Aturan alur murni (batas revisi, routing, fallback siklus) + test |
| `lib/studio/rubrics.ts`, `rubrics/*.json` | Rubrik penilaian dan perhitungan skor di server + test |
| `lib/studio/service.ts` | Semua operasi job (transaksi DB, klaim job, review, aset, publikasi) |
| `lib/studio/auto-check.ts` | Cek teknis aset |
| `lib/db/schema.ts`, `drizzle/` | Skema Postgres dan migrasi |
| `lib/storage.ts` | S3 (bucket privat, URL presigned) |
| `app/dashboard` | Dashboard manusia: status pipeline, approval publikasi |
| `scripts/seed-agents.ts` | Membuat agen dan token |
| `scripts/smoke-test.ts` | Uji end-to-end satu job gambar lewat MCP |

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
bun test                   # unit test aturan alur dan rubrik
bun run build && bun run start
```

Uji end-to-end (server harus berjalan; data uji dihapus otomatis):

```bash
bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-test.ts http://localhost:3000
```

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

Pola kerja setiap agen: `get_next_job` → kerjakan → `submit_*` → ikuti `nextStatus` di hasilnya.

## Batasan Fase 0

- **Cek teknis memakai dimensi/durasi yang dilaporkan Linda**, belum dibaca dari file. Fase 1: baca dari file (decoder gambar / ffprobe) dan perceptual hash untuk cek kemiripan.
- **Tidak ada upload otomatis ke Adobe/Facebook.** Setelah disetujui di dashboard, status menjadi `scheduled`; upload masih manual.
- Rollup riset (mingguan/bulanan/tahunan) bisa disimpan lewat `publish_report`, tetapi belum ada jadwal otomatis.
- Anggaran biaya baru dicatat (`report_cost`), belum menghentikan job secara otomatis.
- Dashboard memakai HTTP Basic auth; cukup untuk satu orang, ganti dengan login sungguhan sebelum dipakai tim.
