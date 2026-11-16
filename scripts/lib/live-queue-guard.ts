/**
 * Smoke tests drive the real pipeline through get_next_job, which always claims the oldest
 * claimable job in the database. If the studio already has live work queued, a test would
 * claim, review and archive real jobs. Refuse to run in that case.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { ROLE_QUEUES } from "@/lib/studio/config";

const CLAIMABLE = [...new Set(Object.values(ROLE_QUEUES).flat())];

export async function assertNoLiveQueue(script: string) {
  const live = await db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(inArray(jobs.status, CLAIMABLE));
  if (!live.length) return;
  console.error(
    `${script} DIBATALKAN: ada ${live.length} job nyata di antrian (${[...new Set(live.map((j) => j.status))].join(", ")}).\n` +
      "Uji ini mengambil job lewat get_next_job dan akan memproses job nyata. Jalankan di database/branch Neon terpisah, " +
      "atau tunggu sampai antrian kosong.",
  );
  process.exit(1);
}
