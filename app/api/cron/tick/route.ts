import { timingSafeEqual } from "node:crypto";
import { runAutomationTick } from "@/lib/studio/service";

/**
 * Periodic health check (stalled jobs, quiet agents, missed research, budgets, halted cycles).
 * Call every 15-30 minutes from any scheduler with:  Authorization: Bearer <CRON_SECRET>
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runAutomationTick());
  } catch (e) {
    console.error("[cron] tick failed", e);
    return Response.json({ error: "Tick gagal; lihat log server" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
