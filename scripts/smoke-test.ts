/**
 * End-to-end smoke test: drives one Adobe Stock job through the whole pipeline over MCP,
 * using the real agent tokens, then deletes everything it created.
 *
 *   bun --env-file=.env --env-file=.env.agents.local scripts/smoke-test.ts [baseUrl]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq, inArray } from "drizzle-orm";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { assets, cycles, ideaGraveyard, ideas, jobs, publications, reviews, transitions } from "@/lib/db/schema";
import { ASSET_BUCKET } from "@/lib/storage";

const base = process.argv[2] ?? "http://localhost:3100";

async function connect(role: string) {
  const token = process.env[`STUDIO_TOKEN_${role.toUpperCase()}`];
  if (!token) throw new Error(`STUDIO_TOKEN_${role.toUpperCase()} missing`);
  const client = new Client({ name: `smoke-${role}`, version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", base), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text);
}

function step(msg: string) {
  console.log(`✓ ${msg}`);
}

const createdCycles: string[] = [];
const s3Keys: string[] = [];

try {
  // Unauthorized request is refused.
  const unauth = await fetch(new URL("/api/mcp", base), { method: "POST", body: "{}" });
  if (unauth.status !== 401) throw new Error(`expected 401 without token, got ${unauth.status}`);
  step("request tanpa token ditolak (401)");

  const [admin, shion, lukas, linda, kechlyn] = await Promise.all(
    ["admin", "shion", "lukas", "linda", "kechlyn"].map(connect),
  );

  const shionTools = (await shion.listTools()).tools.map((t) => t.name);
  if (shionTools.includes("submit_idea_review")) throw new Error("Shion must not see Lukas tools");
  step(`Shion hanya melihat tools perannya (${shionTools.length} tools)`);

  const { cycleIds } = await call(admin, "open_cycle", { platform: "adobe_stock" });
  createdCycles.push(...cycleIds);
  step(`siklus dibuka: ${cycleIds[0].slice(0, 8)}`);

  // Shion: claim + idea
  const ctx1 = await call(shion, "get_next_job", { role: "shion" });
  const jobId: string = ctx1.job.id;
  if (ctx1.job.status !== "idea_pending") throw new Error(`unexpected status ${ctx1.job.status}`);
  await call(shion, "submit_idea", {
    job_id: jobId,
    content: { title: "Tekstur kertas lipat untuk overlay", keywords: ["paper texture", "overlay"] },
  });
  step("Shion mengirim ide v1");

  // Lukas: fail once
  const lctx = await call(lukas, "get_next_job", { role: "lukas" });
  if (lctx.job.id !== jobId || lctx.rubric?.id !== "idea") throw new Error("Lukas got wrong job/rubric");
  const gates = Object.fromEntries(lctx.rubric.gates.map((g: { id: string }) => [g.id, true]));
  const crit = lctx.rubric.criteria.map((c: { id: string }) => c.id);
  const scores = (v: number) => Object.fromEntries(crit.map((id: string) => [id, v]));

  const badReview = await lukas.callTool({
    name: "submit_idea_review",
    arguments: { job_id: jobId, gates, scores: scores(5), feedback: {}, summary: "x" },
  });
  if (!badReview.isError) throw new Error("review without feedback should be rejected");
  step("review skor < 8 tanpa feedback ditolak server");

  const r1 = await call(lukas, "submit_idea_review", {
    job_id: jobId,
    gates,
    scores: scores(6),
    feedback: Object.fromEntries(crit.map((id: string) => [id, `Perbaiki ${id}`])),
    summary: "Belum cukup kuat",
  });
  if (r1.nextStatus !== "idea_revision") throw new Error(`expected idea_revision, got ${r1.nextStatus}`);
  step(`Lukas menolak (skor ${r1.finalScore}) → idea_revision`);

  await call(shion, "get_next_job", { role: "shion" });
  await call(shion, "submit_idea", { job_id: jobId, content: { title: "Tekstur kertas lipat v2" } });
  await call(lukas, "get_next_job", { role: "lukas" });
  const r2 = await call(lukas, "submit_idea_review", {
    job_id: jobId,
    gates,
    scores: scores(9),
    feedback: { clarity: "Tambahkan rasio aspek" },
    summary: "Lolos",
  });
  if (r2.nextStatus !== "executing") throw new Error(`expected executing, got ${r2.nextStatus}`);
  step(`Shion revisi → Lukas meloloskan (skor ${r2.finalScore}) → executing`);

  // Linda: upload, first too small
  await call(linda, "get_next_job", { role: "linda" });
  const up1 = await call(linda, "create_asset_upload", { job_id: jobId, content_type: "image/jpeg" });
  s3Keys.push(up1.s3Key);
  const put1 = await fetch(up1.uploadUrl, { method: "PUT", headers: up1.headers, body: new Uint8Array(2048).fill(7) });
  if (!put1.ok) throw new Error(`S3 PUT failed: ${put1.status} ${await put1.text()}`);
  const a1 = await call(linda, "submit_asset", {
    job_id: jobId,
    s3_key: up1.s3Key,
    content_type: "image/jpeg",
    width: 1024,
    height: 1024,
  });
  if (a1.nextStatus !== "exec_revision") throw new Error(`expected exec_revision, got ${a1.nextStatus}`);
  step(`upload S3 OK; cek teknis menolak 1 MP → exec_revision (${a1.autoCheck.problems[0]})`);

  const up2 = await call(linda, "create_asset_upload", { job_id: jobId, content_type: "image/jpeg" });
  s3Keys.push(up2.s3Key);
  await fetch(up2.uploadUrl, { method: "PUT", headers: up2.headers, body: new Uint8Array(4096).fill(9) });
  const a2 = await call(linda, "submit_asset", {
    job_id: jobId,
    s3_key: up2.s3Key,
    content_type: "image/jpeg",
    width: 2400,
    height: 1800,
  });
  if (a2.nextStatus !== "final_review") throw new Error(`expected final_review, got ${a2.nextStatus}`);
  step("versi 2 (4.32 MP) lolos cek teknis → final_review");

  // Kechlyn
  const kctx = await call(kechlyn, "get_next_job", { role: "kechlyn" });
  if (!kctx.latestAsset?.downloadUrl || kctx.rubric?.id !== "asset-image") throw new Error("Kechlyn context incomplete");
  const kg = Object.fromEntries(kctx.rubric.gates.map((g: { id: string }) => [g.id, true]));
  const kc = Object.fromEntries(kctx.rubric.criteria.map((c: { id: string }) => [c.id, 8]));
  const noDiag = await kechlyn.callTool({
    name: "submit_asset_review",
    arguments: { job_id: jobId, gates: kg, scores: { ...kc, brief_match: 4 }, feedback: { brief_match: "Kurang mirip brief" }, summary: "x" },
  });
  if (!noDiag.isError) throw new Error("failing asset review without diagnosis should be rejected");
  step("review aset gagal tanpa diagnosis ditolak server");

  const k1 = await call(kechlyn, "submit_asset_review", {
    job_id: jobId,
    gates: kg,
    scores: kc,
    feedback: { composition: "Geser fokus sedikit ke kiri" },
    summary: "Layak",
  });
  if (k1.nextStatus !== "publish_prep") throw new Error(`expected publish_prep, got ${k1.nextStatus}`);
  await call(kechlyn, "get_next_job", { role: "kechlyn" });
  const pub = await call(kechlyn, "submit_publication_prep", {
    job_id: jobId,
    title: "Folded paper texture overlay",
    keywords: ["paper", "texture", "overlay"],
    category: "Backgrounds",
    ai_label: true,
  });
  if (pub.nextStatus !== "awaiting_approval") throw new Error("expected awaiting_approval");
  step("Kechlyn meloloskan (skor 8) dan menyiapkan metadata → awaiting_approval");

  // Dashboard
  const user = process.env.STUDIO_DASHBOARD_USER ?? "admin";
  const pass = process.env.STUDIO_DASHBOARD_PASSWORD;
  const noAuth = await fetch(new URL("/dashboard", base));
  if (noAuth.status !== 401) throw new Error(`dashboard without login should be 401, got ${noAuth.status}`);
  const dash = await fetch(new URL("/dashboard", base), {
    headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` },
  });
  const html = await dash.text();
  if (!dash.ok || !html.includes("Folded paper texture overlay")) throw new Error(`dashboard did not show the pending item (${dash.status})`);
  step("dashboard: 401 tanpa login, dengan login menampilkan item menunggu approval");

  await Promise.all([admin, shion, lukas, linda, kechlyn].map((c) => c.close()));
  console.log("\nSMOKE TEST PASSED");
} catch (e) {
  console.error("\nSMOKE TEST FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  // Clean up everything this run created.
  if (createdCycles.length) {
    const jobRows = await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.cycleId, createdCycles));
    const ids = jobRows.map((j) => j.id);
    if (ids.length) {
      await db.delete(publications).where(inArray(publications.jobId, ids));
      await db.delete(ideaGraveyard).where(inArray(ideaGraveyard.jobId, ids));
      for (const t of [transitions, reviews, ideas, assets] as const) await db.delete(t).where(inArray(t.jobId, ids));
      await db.delete(jobs).where(inArray(jobs.id, ids));
    }
    for (const id of createdCycles) await db.delete(cycles).where(eq(cycles.id, id));
  }
  if (s3Keys.length) {
    const s3 = new S3Client({ region: process.env.AWS_REGION ?? "auto", endpoint: process.env.AWS_ENDPOINT_URL_S3, forcePathStyle: true });
    for (const Key of s3Keys) await s3.send(new DeleteObjectCommand({ Bucket: ASSET_BUCKET, Key })).catch(() => {});
  }
  console.log("(data uji dibersihkan)");
  process.exit(process.exitCode ?? 0);
}
