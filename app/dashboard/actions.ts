"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { isDashboardAuthorized } from "@/lib/dashboard-auth";
import { decidePublication } from "@/lib/studio/service";

export async function decidePublicationAction(formData: FormData): Promise<void> {
  if (!isDashboardAuthorized((await headers()).get("authorization"))) {
    throw new Error("Unauthorized");
  }
  const publicationId = String(formData.get("publicationId") ?? "");
  const approved = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || undefined;
  if (!approved && !note) throw new Error("Penolakan wajib disertai catatan untuk Linda");
  await decidePublication(publicationId, approved, note);
  refresh();
}
