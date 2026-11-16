import { connection } from "next/server";
import { Suspense } from "react";
import { adobeUploadKit, calibrationStats, submittedAwaitingResult } from "@/lib/studio/service";
import { AdobeKit, AdobeResults } from "../_components/adobe-kit";
import { Calibration } from "../_components/calibration";
import { PageHeader } from "../_components/ui";

export const metadata = { title: "Adobe Stock · Ryuartistry Studio" };

export default function AdobePage() {
  return (
    <>
      <PageHeader
        eyebrow="Produksi · Adobe Stock"
        title="Adobe Stock"
        description="Gambar yang kamu setujui menunggu diupload di sini, lengkap dengan CSV metadata. Catat hasil moderasi Adobe supaya agen belajar dari penolakan."
      />
      <Suspense fallback={<p className="text-sm text-muted">Memuat kit…</p>}>
        <AdobeData />
      </Suspense>
    </>
  );
}

async function AdobeData() {
  await connection();
  const [kit, submitted, stats] = await Promise.all([
    adobeUploadKit(),
    submittedAwaitingResult("adobe_stock"),
    calibrationStats("adobe_stock"),
  ]);
  return (
    <div className="flex flex-col gap-16">
      <AdobeKit kit={kit} delay={80} />
      <AdobeResults submitted={submitted} delay={140} />
      <Calibration stats={stats} platform="Adobe" delay={200} />
    </div>
  );
}
