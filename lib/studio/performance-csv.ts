/**
 * Parses sales/performance CSV exports into rows keyed by (file name or post link) and day.
 * Header names are matched loosely so exports from different sources work without editing:
 *   file name: filename | file | file name | file_name | original filename      (Adobe Stock)
 *   post link: permalink | post url | post link | link | url                     (Facebook Reels)
 *   day:       date | day | sale date | sales date | publish time
 *   downloads: downloads | quantity | qty | licenses | sales
 *   views:     views | plays | reel plays | video views
 *   revenue:   revenue | revenue_usd | earnings | royalty | amount | estimated earnings
 * Dates may be YYYY-MM-DD, YYYY/MM/DD, or US-style MM/DD/YYYY.
 */

export type PerformanceRow = {
  fileName: string | null;
  postUrl: string | null;
  day: string;
  downloads: number;
  views: number;
  revenueUsd: number;
};

const ALIASES = {
  fileName: ["filename", "file", "file name", "file_name", "original filename", "original file name"],
  postUrl: ["permalink", "post url", "post link", "link", "url"],
  day: ["date", "day", "sale date", "sales date", "publish time"],
  downloads: ["downloads", "quantity", "qty", "licenses", "sales"],
  views: ["views", "plays", "reel plays", "video views"],
  revenue: ["revenue", "revenue_usd", "revenue usd", "earnings", "royalty", "amount", "estimated earnings", "estimated earnings (usd)"],
} as const;

/** Splits one CSV line, honouring double-quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDay(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** With semicolon-delimited files (European exports), a comma is the decimal separator. */
function parseNumber(raw: string | undefined, decimalComma = false): number {
  if (!raw) return 0;
  const s = decimalComma ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parsePerformanceCsv(text: string): { rows: PerformanceRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["CSV kosong atau hanya berisi header"] };

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const col = (names: readonly string[]) => header.findIndex((h) => names.includes(h));
  const idx = {
    fileName: col(ALIASES.fileName),
    postUrl: col(ALIASES.postUrl),
    day: col(ALIASES.day),
    downloads: col(ALIASES.downloads),
    views: col(ALIASES.views),
    revenue: col(ALIASES.revenue),
  };

  const errors: string[] = [];
  if (idx.fileName < 0 && idx.postUrl < 0) {
    errors.push(`Kolom nama file atau link postingan tidak ditemukan (pakai salah satu: ${[...ALIASES.fileName, ...ALIASES.postUrl].join(", ")})`);
  }
  if (idx.day < 0) errors.push(`Kolom tanggal tidak ditemukan (pakai salah satu: ${ALIASES.day.join(", ")})`);
  if (idx.downloads < 0 && idx.views < 0 && idx.revenue < 0) errors.push("Butuh minimal kolom downloads, views, atau revenue");
  if (errors.length) return { rows: [], errors };

  // Sum duplicates of the same file and day (exports often list one row per sale).
  const merged = new Map<string, PerformanceRow>();
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line, delimiter);
    const fileName = idx.fileName >= 0 ? cells[idx.fileName]?.trim() || null : null;
    const postUrl = idx.postUrl >= 0 ? cells[idx.postUrl]?.trim() || null : null;
    const day = parseDay(cells[idx.day] ?? "");
    if ((!fileName && !postUrl) || !day) {
      errors.push(`Baris ${i + 2}: nama file/link atau tanggal tidak valid`);
      return;
    }
    const comma = delimiter === ";";
    const key = `${fileName ?? postUrl}|${day}`;
    const row = merged.get(key) ?? { fileName, postUrl, day, downloads: 0, views: 0, revenueUsd: 0 };
    // Without a downloads column, an Adobe-style export lists one row per sale.
    row.downloads += idx.downloads >= 0 ? parseNumber(cells[idx.downloads], comma) : idx.views >= 0 ? 0 : 1;
    row.views += idx.views >= 0 ? parseNumber(cells[idx.views], comma) : 0;
    row.revenueUsd = Math.round((row.revenueUsd + (idx.revenue >= 0 ? parseNumber(cells[idx.revenue], delimiter === ";") : 0)) * 100) / 100;
    merged.set(key, row);
  });
  return { rows: [...merged.values()], errors };
}
