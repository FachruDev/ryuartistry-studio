"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/lib/auth/server";
import { OUTPUT_ROLES, deleteTrigger, saveTrigger, testTrigger, type TriggerRole } from "@/lib/studio/service";

export type TriggerState = { ok?: string; error?: string } | null;

function roleOf(formData: FormData): TriggerRole {
  const role = String(formData.get("role") ?? "");
  if (!(OUTPUT_ROLES as readonly string[]).includes(role)) throw new Error("Agen tidak dikenal");
  return role as TriggerRole;
}

export async function saveTriggerAction(_prev: TriggerState, formData: FormData): Promise<TriggerState> {
  await requireSession();
  try {
    if (formData.get("intent") === "delete") {
      await deleteTrigger(roleOf(formData));
      refresh();
      return { ok: "Pemicu dihapus" };
    }
    if (formData.get("intent") === "test") {
      const r = await testTrigger(roleOf(formData));
      refresh();
      return r.status === "sent" ? { ok: `Uji terkirim: ${r.detail}` } : { error: `Uji gagal: ${r.detail}` };
    }
    await saveTrigger(roleOf(formData), {
      url: String(formData.get("url") ?? ""),
      secret: String(formData.get("secret") ?? ""),
      times: String(formData.get("times") ?? ""),
      enabled: formData.get("enabled") === "on",
      clearSecret: formData.get("clear_secret") === "on",
    });
    refresh();
    return { ok: "Pemicu disimpan" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
