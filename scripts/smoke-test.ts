/**
 * End-to-end smoke test of the Adobe Stock image flow over MCP with the real agent tokens.
 *
 *   bun --env-file=.env --env-file=.env.local --env-file=.env.agents.local scripts/smoke-test.ts [baseUrl]
 *
 * Deletes everything it created. Set KEEP=1 to leave the data in place (for looking at the
 * dashboard); remove it later with:  scripts/smoke-test.ts --cleanup <cycleId,cycleId>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { inArray } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/lib/db";
import { assets, cycles, ideaGraveyard, ideas, jobs, publications, reviews, transitions } from "@/lib/db/schema";
import { ASSET_BUCKET } from "@/lib/storage";
import { operatorCookie } from "./lib/operator-cookie";
import { calibrationStats, decidePublication, markSubmitted, recordPlatformResult } from "@/lib/studio/service";

const args = process.argv.slice(2);
const cleanupIdx = args.indexOf("--cleanup");
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100";

const createdCycles: string[] = cleanupIdx >= 0 ? (args[cleanupIdx + 1] ?? "").split(",").filter(Boolean) : [];
const s3Keys: string[] = [];
const step = (msg: string) => console.log(`✓ ${msg}`);
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function connect(role: string) {
  const token = process.env[`STUDIO_TOKEN_${role.toUpperCase()}`];
  expect(token, `STUDIO_TOKEN_${role.toUpperCase()} missing`);
  const client = new Client({ name: `smoke-${role}`, version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", base), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

async function call(client: Client, name: string, a: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: a });
  const text = (res.content as { text: string }[])[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text);
}

async function callError(client: Client, name: string, a: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: a });
  expect(res.isError, `${name} should have failed`);
  return (res.content as { text: string }[])[0]?.text ?? "";
}

/** A real JPEG with a distinctive pattern, so dHash differs per seed. */
function makeJpeg(width: number, height: number, seed: number) {
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const x = ((seed * 37 + i * 101) % 90) + 5;
    const y = ((seed * 53 + i * 67) % 90) + 5;
    return `<circle cx="${x}%" cy="${y}%" r="${8 + ((seed + i) % 12)}%" fill="hsl(${(seed * 40 + i * 60) % 360},70%,50%)"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f4efe6"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function upload(linda: Client, jobId: string, bytes: Buffer) {
  const up = await call(linda, "create_asset_upload", { job_id: jobId, content_type: "image/jpeg" });
  s3Keys.push(up.s3Key);
  const put = await fetch(up.uploadUrl, { method: "PUT", headers: up.headers, body: new Uint8Array(bytes) });
  expect(put.ok, `S3 PUT failed: ${put.status}`);
  return call(linda, "submit_asset", { job_id: jobId, s3_key: up.s3Key, content_type: "image/jpeg", notes: "smoke" });
}

/** Passes a fresh cycle's first idea through Shion and Lukas; returns the job id. */
async function ideaApproved(admin: Client, shion: Client, lukas: Client, title: string) {
  const { cycleIds } = await call(admin, "open_cycle", { platform: "adobe_stock" });
  createdCycles.push(...cycleIds);
  const ctx = await call(shion, "get_next_job", { role: "shion" });
  await call(shion, "submit_idea", { job_id: ctx.job.id, content: { title } });
  const l = await call(lukas, "get_next_job", { role: "lukas" });
  const gates = Object.fromEntries(l.rubric.gates.map((g: { id: string }) => [g.id, true]));
  const scores = Object.fromEntries(l.rubric.criteria.map((c: { id: string }) => [c.id, 9]));
  const r = await call(lukas, "submit_idea_review", {
    job_id: ctx.job.id,
    gates,
    scores,
    feedback: { clarity: "Sebutkan rasio aspek" },
    summary: "Lolos",
  });
  expect(r.nextStatus === "executing", `expected executing, got ${r.nextStatus}`);
  return ctx.job.id as string;
}

async function run() {
  const unauth = await fetch(new URL("/api/mcp", base), { method: "POST", body: "{}" });
  expect(unauth.status === 401, `expected 401 without token, got ${unauth.status}`);
  step("MCP tanpa token ditolak (401)");

  const [admin, shion, lukas, linda, kechlyn] = await Promise.all(
    ["admin", "shion", "lukas", "linda", "kechlyn"].map(connect),
  );
  const playbook = (await shion.callTool({ name: "get_playbook", arguments: {} })).content as { text: string }[];
  expect(playbook[0].text.includes("Playbook Shion"), "Shion playbook missing");
  step("get_playbook mengembalikan playbook sesuai peran");

  const jobId = await ideaApproved(admin, shion, lukas, "Folded paper texture");
  step("ide lolos Shion → Lukas → executing");

  const small = await upload(linda, jobId, await makeJpeg(1024, 1024, 1));
  expect(small.nextStatus === "exec_revision", `expected exec_revision, got ${small.nextStatus}`);
  expect(small.autoCheck.problems.some((p: string) => p.includes("1024x1024")), "resolution read from file");
  step(`resolusi dibaca dari file: ${small.autoCheck.problems[0]}`);

  const png = await upload(linda, jobId, await sharp(await makeJpeg(2400, 1800, 2)).png().toBuffer());
  expect(png.autoCheck.problems.some((p: string) => p.includes("png")), "PNG disguised as JPEG must fail");
  step("PNG yang diaku JPEG ditolak (format dibaca dari isi file)");

  const goodBytes = await makeJpeg(2400, 1800, 3);
  const good = await upload(linda, jobId, goodBytes);
  expect(good.nextStatus === "final_review", `expected final_review, got ${good.nextStatus}: ${good.autoCheck.problems}`);
  step("JPEG 2400×1800 sRGB lolos cek teknis → final_review");

  const k = await call(kechlyn, "get_next_job", { role: "kechlyn" });
  expect(k.adobeCategories?.[8] === "Graphic Resources", "Kechlyn context lacks Adobe categories");
  const kg = Object.fromEntries(k.rubric.gates.map((g: { id: string }) => [g.id, true]));
  const kc = Object.fromEntries(k.rubric.criteria.map((c: { id: string }) => [c.id, 8]));
  await call(kechlyn, "submit_asset_review", { job_id: jobId, gates: kg, scores: kc, feedback: { composition: "ok" }, summary: "Layak" });
  await call(kechlyn, "get_next_job", { role: "kechlyn" });

  const bad = await callError(kechlyn, "submit_publication_prep", {
    job_id: jobId,
    title: "Paper, texture",
    keywords: ["paper", "midjourney"],
    category: 99,
    ai_label: true,
  });
  expect(bad.includes("koma") && bad.includes("minimal 5") && bad.includes("midjourney") && bad.includes("Kategori"), bad);
  step("metadata Adobe tidak valid ditolak dengan semua alasannya sekaligus");

  const pub = await call(kechlyn, "submit_publication_prep", {
    job_id: jobId,
    title: "Folded paper texture background",
    keywords: ["Paper", "texture", "folded", "background", "overlay", "paper"],
    category: 8,
    ai_label: true,
  });
  expect(pub.fileName.length <= 30 && pub.keywords.length === 5, `fileName/keywords wrong: ${JSON.stringify(pub)}`);
  step(`metadata valid: file ${pub.fileName}, keyword dinormalisasi jadi ${pub.keywords.length}`);

  await decidePublication(pub.publicationId, true, 7, "Bagus");
  const cookie = await operatorCookie();
  const anon = await fetch(new URL("/dashboard/kit/adobe-csv", base), { redirect: "manual" });
  expect(anon.status === 307 && anon.headers.get("location")?.includes("/login"), `CSV must need login, got ${anon.status}`);
  const csv = await (await fetch(new URL("/dashboard/kit/adobe-csv", base), { headers: { Cookie: cookie } })).text();
  expect(csv.startsWith("Filename,Title,Keywords,Category,Releases") && csv.includes(pub.fileName), `CSV wrong:
${csv}`);
  const dash = await (await fetch(new URL("/dashboard/adobe", base), { headers: { Cookie: cookie } })).text();
  expect(dash.includes("Kit upload") && dash.includes(pub.fileName), "Adobe page kit missing item");
  step("approval (skor manusia 7) → kit upload + CSV Adobe berisi file tersebut");

  // Duplicate detection: same image in another job.
  const job2 = await ideaApproved(admin, shion, lukas, "Folded paper texture again");
  const dup = await upload(linda, job2, goodBytes);
  expect(dup.autoCheck.problems.some((p: string) => p.includes("mirip")), `duplicate not caught: ${dup.autoCheck.problems}`);
  step(`gambar duplikat di job lain ditolak: ${dup.autoCheck.problems.find((p: string) => p.includes("mirip"))}`);

  if (process.env.KEEP) {
    console.log(`\nKEEP=1: data dibiarkan. Hapus nanti: --cleanup ${createdCycles.join(",")}`);
    return;
  }

  await markSubmitted([pub.publicationId]);
  await recordPlatformResult(pub.publicationId, false, "Quality issues: noise");
  const [archived] = await db.select().from(jobs).where(inArray(jobs.id, [jobId]));
  expect(archived.status === "archived" && archived.archiveStage === "platform", "platform rejection should archive");
  const s = await call(shion, "get_job", { job_id: job2 });
  expect(s.platformRejections.some((r: { reason: string }) => r.reason?.includes("noise")), "rejection not in context");
  const stats = await calibrationStats("adobe_stock");
  expect(stats.reviewed >= 1 && stats.platformDecided >= 1, "calibration stats not updated");
  step("ditolak Adobe → job diarsipkan, alasan muncul di konteks agen dan statistik kalibrasi");

  await Promise.all([admin, shion, lukas, linda, kechlyn].map((c) => c.close()));
  console.log("\nSMOKE TEST PASSED");
}

async function cleanup() {
  if (createdCycles.length) {
    const ids = (await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.cycleId, createdCycles))).map((j) => j.id);
    if (ids.length) {
      const keys = await db.select({ k: assets.s3Key }).from(assets).where(inArray(assets.jobId, ids));
      s3Keys.push(...keys.map((x) => x.k));
      await db.delete(publications).where(inArray(publications.jobId, ids));
      await db.delete(ideaGraveyard).where(inArray(ideaGraveyard.jobId, ids));
      for (const t of [transitions, reviews, ideas, assets] as const) await db.delete(t).where(inArray(t.jobId, ids));
      await db.delete(jobs).where(inArray(jobs.id, ids));
    }
    await db.delete(cycles).where(inArray(cycles.id, createdCycles));
  }
  const s3 = new S3Client({ region: process.env.AWS_REGION ?? "auto", endpoint: process.env.AWS_ENDPOINT_URL_S3, forcePathStyle: true });
  for (const Key of new Set(s3Keys)) await s3.send(new DeleteObjectCommand({ Bucket: ASSET_BUCKET, Key })).catch(() => {});
  console.log("(data uji dibersihkan)");
}

try {
  if (cleanupIdx < 0) await run();
} catch (e) {
  console.error("\nSMOKE TEST FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  if (!process.env.KEEP || cleanupIdx >= 0) await cleanup();
  process.exit(process.exitCode ?? 0);
}
