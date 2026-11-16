import { z } from "zod";
import { StudioError } from "@/lib/studio/service";

export const platformSchema = z.enum(["adobe_stock", "facebook_reels"]);
export const levelSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

export type PlatformArg = z.infer<typeof platformSchema>;
export type LevelArg = z.infer<typeof levelSchema>;

export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function fail(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Wraps a handler so domain errors come back to the agent as readable tool errors. */
export function run<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      if (!(e instanceof StudioError) && !(e instanceof Error && e.message.startsWith("Review tidak valid"))) {
        console.error("[mcp] tool error", e);
      }
      return fail(e);
    }
  };
}
