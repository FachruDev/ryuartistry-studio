import { isDashboardAuthorized } from "@/lib/dashboard-auth";
import { adobeKitCsv } from "@/lib/studio/service";

/** CSV for Adobe Stock "Upload CSV" with every approved, not-yet-uploaded image. */
export async function GET(request: Request) {
  if (!isDashboardAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const csv = await adobeKitCsv();
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adobe-stock-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
