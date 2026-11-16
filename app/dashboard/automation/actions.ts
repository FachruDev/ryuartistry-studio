"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/lib/auth/server";
import { revokeConnection } from "@/lib/oauth/service";
import { getAutomationSettings, markNotificationsRead, rotateAgentToken, runAutomationTick, saveAutomationSettings } from "@/lib/studio/service";

export type SettingsState = { ok?: string; error?: string } | null;

/** Empty input = no limit. */
function money(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
}

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireSession();
  const current = await getAutomationSettings();
  try {
    await saveAutomationSettings({
      autoPublish: {
        adobe_stock: formData.get("auto_adobe_stock") === "on",
        facebook_reels: formData.get("auto_facebook_reels") === "on",
      },
      budget: {
        dailyUsd: { adobe_stock: money(formData.get("daily_adobe_stock")), facebook_reels: money(formData.get("daily_facebook_reels")) },
        perJobUsd: money(formData.get("per_job")),
      },
      staleQueueHours: Number(formData.get("stale_hours") ?? current.staleQueueHours),
      agentQuietHours: Number(formData.get("quiet_hours") ?? current.agentQuietHours),
      webhookUrl: String(formData.get("webhook") ?? "").trim() || null,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Pengaturan disimpan" };
}

export type TokenState = { token?: string; name?: string; error?: string } | null;

export async function rotateTokenAction(_prev: TokenState, formData: FormData): Promise<TokenState> {
  await requireSession();
  try {
    const r = await rotateAgentToken(String(formData.get("agentId")));
    refresh();
    return { token: r.token, name: r.name };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export type TickState = { ok?: string; error?: string } | null;

export async function runTickAction(): Promise<TickState> {
  await requireSession();
  try {
    const r = await runAutomationTick();
    refresh();
    return { ok: r.newNotifications.length ? `${r.newNotifications.length} notifikasi baru` : "Semua aman, tidak ada notifikasi baru" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function markAllReadAction(): Promise<void> {
  await requireSession();
  await markNotificationsRead();
  refresh();
}

export async function revokeConnectionAction(formData: FormData): Promise<void> {
  await requireSession();
  await revokeConnection(String(formData.get("familyId")));
  refresh();
}
