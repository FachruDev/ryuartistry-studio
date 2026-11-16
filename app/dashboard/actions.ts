"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/lib/auth/server";
import {
  decidePublication,
  markNotificationsRead,
  markReelPosted,
  markSubmitted,
  recordPlatformResult,
  recordReelRestriction,
} from "@/lib/studio/service";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || undefined;

export async function decidePublicationAction(formData: FormData): Promise<void> {
  await requireSession();
  const approved = formData.get("decision") === "approve";
  const note = text(formData, "note");
  if (!approved && !note) throw new Error("Penolakan wajib disertai catatan untuk Linda");
  await decidePublication(String(formData.get("publicationId")), approved, Number(formData.get("humanScore")), note);
  refresh();
}

export async function markSubmittedAction(formData: FormData): Promise<void> {
  await requireSession();
  await markSubmitted(formData.getAll("publicationId").map(String));
  refresh();
}

export async function recordPlatformResultAction(formData: FormData): Promise<void> {
  await requireSession();
  await recordPlatformResult(
    String(formData.get("publicationId")),
    formData.get("result") === "accepted",
    text(formData, "note"),
    text(formData, "externalId"),
  );
  refresh();
}

export type ReelActionState = { error?: string; ok?: string } | null;

export async function markReelPostedAction(_prev: ReelActionState, formData: FormData): Promise<ReelActionState> {
  await requireSession();
  try {
    await markReelPosted(String(formData.get("publicationId")), String(formData.get("postUrl") ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Ditandai terposting" };
}

export async function recordReelRestrictionAction(_prev: ReelActionState, formData: FormData): Promise<ReelActionState> {
  await requireSession();
  try {
    await recordReelRestriction(String(formData.get("publicationId")), String(formData.get("reason") ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Dicatat sebagai dibatasi Meta" };
}

export async function markNotificationsReadAction(): Promise<void> {
  await requireSession();
  await markNotificationsRead();
  refresh();
}
