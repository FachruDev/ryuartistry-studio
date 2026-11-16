import { expect, test } from "bun:test";
import { parsePerformanceCsv } from "./performance-csv";

test("parses aliases, quoted fields, and sums one-row-per-sale exports", () => {
  const csv = [
    "Original Filename,Sale Date,Earnings",
    'paper-a1b2c3d4.jpg,2026-11-20,"$0.99"',
    "paper-a1b2c3d4.jpg,2026-11-20,0.33",
    "other.jpg,11/21/2026,1.00",
  ].join("\r\n");
  const { rows, errors } = parsePerformanceCsv(csv);
  expect(errors).toEqual([]);
  expect(rows).toEqual([
    { fileName: "paper-a1b2c3d4.jpg", postUrl: null, day: "2026-11-20", downloads: 2, views: 0, revenueUsd: 1.32 },
    { fileName: "other.jpg", postUrl: null, day: "2026-11-21", downloads: 1, views: 0, revenueUsd: 1 },
  ]);
});

test("supports semicolon delimiters and explicit downloads", () => {
  const { rows } = parsePerformanceCsv("file;date;downloads;revenue\nx.jpg;2026/11/02;3;1,5");
  expect(rows[0]).toEqual({ fileName: "x.jpg", postUrl: null, day: "2026-11-02", downloads: 3, views: 0, revenueUsd: 1.5 });
});

test("reports missing columns and bad rows", () => {
  expect(parsePerformanceCsv("name,amount\na,1").errors[0]).toContain("nama file");
  const { errors } = parsePerformanceCsv("filename,date,revenue\na.jpg,yesterday,1");
  expect(errors[0]).toContain("Baris 2");
});

test("reads Facebook-style exports keyed by post link with views", () => {
  const csv = "Permalink,Publish time,Views,Estimated earnings (USD)\nhttps://www.facebook.com/reel/123,2026-11-20,1520,0.42";
  const { rows, errors } = parsePerformanceCsv(csv);
  expect(errors).toEqual([]);
  expect(rows[0]).toEqual({ fileName: null, postUrl: "https://www.facebook.com/reel/123", day: "2026-11-20", downloads: 0, views: 1520, revenueUsd: 0.42 });
});
