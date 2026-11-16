import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as coreSchema from "./schema";
import * as authSchema from "./schema-auth";
import * as automationSchema from "./schema-automation";
import * as oauthSchema from "./schema-oauth";
import * as scoutSchema from "./schema-scout";

const schema = { ...coreSchema, ...automationSchema, ...authSchema, ...oauthSchema, ...scoutSchema };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Neon's pooler runs in transaction mode, which does not support prepared statements.
  return postgres(url, { prepare: false, max: 5 });
}

const globalForDb = globalThis as unknown as { studioSql?: ReturnType<typeof postgres> };

// Reuse one connection pool across hot reloads in development.
const sql = globalForDb.studioSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.studioSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
