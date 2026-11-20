import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./lib/db/schema.ts", "./lib/db/schema-automation.ts", "./lib/db/schema-auth.ts", "./lib/db/schema-oauth.ts", "./lib/db/schema-scout.ts", "./lib/db/schema-triggers.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
