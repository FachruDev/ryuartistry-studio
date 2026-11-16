"use server";

import { refresh } from "next/cache";
import { getSession } from "@/lib/auth/server";
import { parsePerformanceCsv } from "@/lib/studio/performance-csv";
import { importPerformance } from "@/lib/studio/service";

export type ImportState = {
  imported: number;
  unmatched: string[];
  parseErrors: string[];
  error?: string;
} | null;

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const fail = (error: string, parseErrors: string[] = []): ImportState => ({ imported: 0, unmatched: [], parseErrors, error });

export async function importPerformanceAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  if (!(await getSession())) return fail("Sesi berakhir. Muat ulang halaman lalu masuk lagi.");
  const platform = formData.get("platform") === "facebook_reels" ? "facebook_reels" : "adobe_stock";
  const file = formData.get("file");
  let text = String(formData.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return fail("File lebih dari 2 MB. Pecah ekspornya per bulan lalu impor bergantian.");
    text = await file.text();
  }
  if (!text.trim()) return fail("Pilih file CSV atau tempel isinya di kotak teks.");

  const { rows, errors } = parsePerformanceCsv(text);
  if (!rows.length) return fail("Tidak ada baris yang bisa diimpor. Periksa nama kolom di atas.", errors);

  const result = await importPerformance(platform, rows);
  refresh();
  return { ...result, parseErrors: errors };
}
