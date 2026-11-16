"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { isDashboardAuthorized } from "@/lib/dashboard-auth";
import { parsePerformanceCsv } from "@/lib/studio/performance-csv";
import { importPerformance } from "@/lib/studio/service";

export type ImportState = {
  imported: number;
  unmatched: string[];
  parseErrors: string[];
  error?: string;
} | null;

const MAX_CSV_BYTES = 2 * 1024 * 1024;

export async function importPerformanceAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  if (!isDashboardAuthorized((await headers()).get("authorization"))) {
    return { imported: 0, unmatched: [], parseErrors: [], error: "Unauthorized" };
  }
  const file = formData.get("file");
  let text = String(formData.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return { imported: 0, unmatched: [], parseErrors: [], error: "File lebih dari 2 MB" };
    text = await file.text();
  }
  if (!text.trim()) return { imported: 0, unmatched: [], parseErrors: [], error: "Pilih file atau tempel isi CSV" };

  const { rows, errors } = parsePerformanceCsv(text);
  if (!rows.length) return { imported: 0, unmatched: [], parseErrors: errors, error: "Tidak ada baris yang bisa diimpor" };

  const result = await importPerformance("adobe_stock", rows);
  refresh();
  return { ...result, parseErrors: errors };
}
