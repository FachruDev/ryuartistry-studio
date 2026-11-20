CREATE TYPE "public"."trigger_run_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "agent_trigger_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "agent_role" NOT NULL,
	"run_key" text NOT NULL,
	"status" "trigger_run_status" NOT NULL,
	"http_status" integer,
	"detail" text,
	"due" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "agent_role" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"url" text NOT NULL,
	"secret_enc" text,
	"times" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_trigger_runs_key_uq" ON "agent_trigger_runs" USING btree ("run_key");--> statement-breakpoint
CREATE INDEX "agent_trigger_runs_role_idx" ON "agent_trigger_runs" USING btree ("role","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_triggers_role_uq" ON "agent_triggers" USING btree ("role");