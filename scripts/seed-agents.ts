/**
 * Creates the studio agents and issues one bearer token per agent.
 *
 *   bun --env-file=.env scripts/seed-agents.ts            # create missing agents
 *   bun --env-file=.env scripts/seed-agents.ts --rotate   # issue new tokens for all agents
 *
 * Tokens are written to .env.agents.local (git-ignored) and are never stored in the database;
 * only their sha256 hash is. Keep that file private: anyone with a token can act as that agent.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, type AgentRole } from "@/lib/db/schema";
import { hashToken } from "@/lib/studio/service";

const TEAM: { name: string; role: AgentRole; model: string }[] = [
  { name: "Rina", role: "rina", model: "claude + grok" },
  { name: "Shion", role: "shion", model: "chatgpt" },
  { name: "Lukas", role: "lukas", model: "claude" },
  { name: "Linda", role: "linda", model: "gemini/gpt-image (gambar), claude (reels)" },
  { name: "Kechlyn", role: "kechlyn", model: "claude" },
  { name: "Admin", role: "admin", model: "human" },
];

const OUT = ".env.agents.local";
const rotate = process.argv.includes("--rotate");

const lines: string[] = [];
for (const member of TEAM) {
  const [existing] = await db.select().from(agents).where(eq(agents.role, member.role)).limit(1);
  if (existing && !rotate) {
    console.log(`- ${member.name}: sudah ada, dilewati (pakai --rotate untuk token baru)`);
    continue;
  }
  const token = `rs_${member.role}_${randomBytes(24).toString("base64url")}`;
  if (existing) {
    await db.update(agents).set({ tokenHash: hashToken(token) }).where(eq(agents.id, existing.id));
  } else {
    await db.insert(agents).values({ ...member, tokenHash: hashToken(token) });
  }
  lines.push(`STUDIO_TOKEN_${member.role.toUpperCase()}=${token}`);
  console.log(`- ${member.name}: token ${existing ? "diganti" : "dibuat"}`);
}

if (lines.length) {
  const header = `# Studio agent tokens, generated ${new Date().toISOString()}\n`;
  if (rotate || !existsSync(OUT)) writeFileSync(OUT, header + lines.join("\n") + "\n");
  else appendFileSync(OUT, header + lines.join("\n") + "\n");
  console.log(`Token ditulis ke ${OUT}`);
}
process.exit(0);
