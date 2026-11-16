import { connection } from "next/server";
import { Suspense } from "react";
import { REELS_CHANNEL } from "@/lib/studio/config";
import { calibrationStats, postedReels, reelsPostingKit } from "@/lib/studio/service";
import { Calibration } from "../_components/calibration";
import { PostedReels, ReelsKit } from "../_components/reels";
import { Badge, PageHeader } from "../_components/ui";

export const metadata = { title: "Reels · Ryuartistry Studio" };

export default function ReelsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Produksi · Facebook Reels"
        title="Reels"
        description="Reel vertikal 30–60 detik yang sudah lolos Kechlyn dan kamu setujui. Posting lewat Meta, lalu tempel link-nya di sini supaya performanya bisa dilacak."
      >
        <Badge tone={REELS_CHANNEL.niche ? "accent" : "warn"}>Niche: {REELS_CHANNEL.niche ?? "belum ditetapkan"}</Badge>
      </PageHeader>
      <Suspense fallback={<p className="text-sm text-muted">Memuat reels…</p>}>
        <ReelsData />
      </Suspense>
    </>
  );
}

async function ReelsData() {
  await connection();
  const [kit, posted, stats] = await Promise.all([reelsPostingKit(), postedReels(), calibrationStats("facebook_reels")]);
  return (
    <div className="flex flex-col gap-16">
      <ReelsKit kit={kit} niche={REELS_CHANNEL.niche} delay={80} />
      <PostedReels posted={posted} delay={140} />
      <Calibration stats={stats} platform="Meta" delay={200} />
    </div>
  );
}
