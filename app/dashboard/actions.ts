"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { isDashboardAuthorized } from "@/lib/dashboard-auth";
import { decidePublication, markSubmitted, recordPlatformResult } from "@/lib/studio/service";

async function requireAuth() {
  if (!isDashboardAuthorized((await headers()).get("authorization"))) {
    throw new Error("Unauthorized");
  }
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || undefined;

export async function decidePublicationAction(formData: FormData): Promise<void> {
  await requireAuth();
  const approved = formData.get("decision") === "approve";
  const note = text(formData, "note");
  if (!approved && !note) throw new Error("Penolakan wajib disertai catatan untuk Linda");
  await decidePublication(String(formData.get("publicationId")), approved, Number(formData.get("humanScore")), note);
  refresh();
}

export async function markSubmittedAction(formData: FormData): Promise<void> {
  await requireAuth();
  await markSubmitted(formData.getAll("publicationId").map(String));
  refresh();
}

export async function recordPlatformResultAction(formData: FormData): Promise<void> {
  await requireAuth();
  await recordPlatformResult(
    String(formData.get("publicationId")),
    formData.get("result") === "accepted",
    text(formData, "note"),
    text(formData, "externalId"),
  );
  refresh();
}
