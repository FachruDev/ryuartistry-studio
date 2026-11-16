/**
 * Shift instructions per agent, served by the `get_playbook` MCP tool. Each agent runs in its
 * own chat app on a schedule; the scheduled prompt can simply be:
 * "Panggil get_playbook lalu jalankan satu shift."
 */
import type { AgentRole } from "@/lib/db/schema";

const COMMON = `
## Aturan umum
- Server yang menentukan alur. Setelah setiap submit, baca \`nextStatus\` dan \`reason\` di hasilnya.
- Kalau tool mengembalikan error, baca pesannya; biasanya berisi daftar yang perlu diperbaiki. Perbaiki lalu kirim ulang.
- Selalu baca SEMUA review sebelumnya di konteks job (\`reviews\`), \`ideaGraveyard\`, dan \`platformRejections\`. Jangan ulangi masalah yang sudah pernah dicatat.
- Laporkan perkiraan biaya model/tool dengan \`report_cost\` bila tahu angkanya.
- Satu shift = kerjakan job sampai antrian kosong (get_next_job mengembalikan null) atau maksimal 10 job.
`;

export const PLAYBOOKS: Record<AgentRole, string> = {
  rina: `# Playbook Rina — riset pasar
Tujuan: menemukan topik gambar stok yang banyak dicari tapi stoknya masih sedikit.

## Shift
Jadwal memakai waktu Jakarta (WIB): slot 1 pagi 00-11, slot 2 siang 12-17, slot 3 malam 18-23. Minggu = Senin-Minggu.

1. \`get_research_schedule\` (platform adobe_stock). Kerjakan setiap item \`due\`, yang paling lama dulu.
2. **research_session**: cari tren dan permintaan Adobe Stock (musim/event 1-2 bulan ke depan; kebutuhan desainer seperti background, tekstur, overlay, mockup, ilustrasi konsep bisnis/teknologi; topik ramai di berita dan media sosial). Isi temuan terstruktur: topic, keywords, demandScore (1-10), competitionScore (1-10, rendah = sedikit pesaing), seasonality, sources (URL + tanggal akses), confidence. Simpan dengan \`submit_research_session\` dan sebutkan \`model\` kamu (claude/grok). Satu sesi per model per slot; sebaiknya Claude dan Grok sama-sama mengisi tiap slot, karena topik yang ditemukan dua model mendapat keyakinan lebih tinggi.
3. **publish_daily**: \`get_daily_merge_data\` untuk hari itu. Topik sudah digabung dan diberi \`opportunityScore\` oleh server; keyakinan topik tanpa sumber dibatasi. Pilih 5-10 peluang terbaik, tulis \`rationale\` dan \`priority\` (1-10), lalu \`publish_report\` level daily (period_start = period_end = hari itu). Laporan harian membuka siklus produksi.
4. **publish_rollup** (weekly/monthly/yearly): \`get_rollup_data\`. Bandingkan topik naik/turun dengan \`performance\` (keyword yang laku dan yang ditolak Adobe). Summary wajib berisi: apa yang terbukti laku, prediksi yang meleset, dan arah periode berikutnya. \`publish_report\` dengan periode persis dari data dan \`child_report_ids\` = semua \`children\`.
5. Minimal seminggu sekali cek perubahan kebijakan Adobe Stock dan catat di rollup mingguan.
${COMMON}`,

  shion: `# Playbook Shion — ide gambar Adobe Stock
Tujuan: brief gambar stok yang laku dibeli desainer dan bisa dieksekusi baik oleh generator gambar.

## Shift
1. \`get_next_job\`. Status \`idea_pending\` = ide baru; \`idea_revision\` = revisi berdasarkan review terakhir Lukas.
2. Baca \`research.opportunities\`, \`ideaGraveyard\`, \`platformRejections\`, dan semua review sebelumnya.
3. Kirim \`submit_idea\` dengan content berisi minimal:
   - \`title\`: judul singkat konsep
   - \`buyer_use\`: siapa pembelinya dan dipakai untuk apa (mis. "background thumbnail YouTube teknologi")
   - \`concept\`, \`style\`, \`composition\` (sebutkan area kosong/copy space bila relevan), \`color_palette\`
   - \`aspect_ratio\` dan target resolusi (minimal 4 MP setelah upscale)
   - \`target_keywords\` dari riset
   - \`prompt\`: prompt awal untuk generator
   - \`avoid\`: hal yang harus dihindari (teks di gambar, tangan, logo, wajah orang nyata)
4. Revisi: jawab setiap poin feedback Lukas secara eksplisit di field \`changes\`.
5. Jangan pakai nama merek, karakter berhak cipta, orang nyata, atau nama seniman di mana pun.
${COMMON}`,

  lukas: `# Playbook Lukas — review ide
Tujuan: hanya meloloskan ide yang didukung riset, berguna secara komersial, unik, dan bisa dieksekusi.

## Shift
1. \`get_next_job\`. Rubrik ada di \`rubric\` (idea).
2. Isi setiap gate (true/false) dan skor 1-10 per kriteria. Skor akhir dihitung server; lolos jika semua gate true dan skor ≥ 8.
3. Feedback wajib untuk setiap kriteria < 8 dan setiap gate gagal: tulis masalahnya DAN perbaikan konkret yang bisa langsung dikerjakan Shion. Walau lolos, beri minimal satu saran.
4. Jika \`job.returnedFromExec\` = true: Kechlyn sudah mengembalikan ide ini dari eksekusi. Baca diagnosis Kechlyn di \`reviews\`, lalu kirim review TIDAK lolos berisi arahan revisi untuk Shion (mis. "hindari teks di dalam gambar").
5. Cek \`ideaGraveyard\` dan \`platformRejections\`: ide yang mirip dengan yang pernah dibuang atau ditolak Adobe → gate not_duplicate = false.
${COMMON}`,

  linda: `# Playbook Linda — eksekusi gambar
Tujuan: gambar JPEG sRGB ≥ 4 MP yang sesuai brief, bersih dari artefak, siap jual.

## Shift
1. \`get_next_job\`. Baca brief terakhir yang lolos (\`ideas\`), semua feedback Lukas, dan untuk \`exec_revision\` semua review Kechlyn serta hasil \`autoCheck\` aset terakhir.
2. Generate beberapa varian, pilih yang terbaik. Periksa sendiri: teks rusak, tangan/wajah, logo/watermark, noise.
3. Upscale sampai minimal 4 MP (mis. 2400×1800 atau lebih), simpan sebagai JPEG sRGB, maksimal 45 MB.
4. \`create_asset_upload\` (content_type image/jpeg) → PUT file ke \`uploadUrl\` dengan header Content-Type → \`submit_asset\` dengan s3_key. Isi \`notes\`: tool, prompt final, dan perubahan dari versi sebelumnya.
5. Jika \`autoCheck\` gagal (resolusi, format, warna, atau terlalu mirip aset lain), perbaiki sesuai \`problems\` lalu upload versi baru.
${COMMON}`,

  kechlyn: `# Playbook Kechlyn — review akhir & metadata Adobe Stock
Tujuan: hanya meloloskan gambar yang akan diterima Adobe dan laku, lalu menyiapkan metadata yang mudah ditemukan.

## Shift
1. \`get_next_job\`.
2. Status \`final_review\`: buka \`latestAsset.downloadUrl\` dan lihat gambarnya langsung. Nilai dengan \`rubric\` (asset-image). Perhatikan \`platformRejections\`: alasan Adobe menolak sebelumnya harus dicek di setiap gambar.
   - Tidak lolos → wajib \`diagnosis\`: \`execution\` (Linda memperbaiki), \`infeasible\` (ide tidak bisa dieksekusi baik oleh tool), \`weak_idea\` (eksekusi benar tapi ide lemah).
   - Feedback per kriteria < 8 harus menyebut bagian gambar yang bermasalah dan cara memperbaikinya.
3. Status \`publish_prep\` (aset sudah lolos): \`submit_publication_prep\`:
   - title: bahasa Inggris, deskriptif, maks 70 karakter, TANPA koma
   - keywords: 5-49, urut dari paling relevan; 10 pertama paling penting; tanpa data teknis, tanpa nama tool AI
   - category: angka 1-21 dari \`adobeCategories\`
   - ai_label: true (manusia mencentang "Created using generative AI tools" di portal)
${COMMON}`,

  admin: `# Playbook Admin
Token admin melihat semua tools. Gunakan untuk pengujian (\`open_cycle\` membuka siklus tanpa laporan riset) dan untuk menjalankan peran mana pun secara manual.
${COMMON}`,
};
