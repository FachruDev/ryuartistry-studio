ALTER TYPE "public"."agent_role" ADD VALUE 'rina_scout' BEFORE 'shion';--> statement-breakpoint
CREATE TABLE "trend_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"day" date NOT NULL,
	"slot" smallint NOT NULL,
	"model" text NOT NULL,
	"agent_id" uuid,
	"signals" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trend_scans" ADD CONSTRAINT "trend_scans_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trend_scans_slot_uq" ON "trend_scans" USING btree ("platform","day","slot");--> statement-breakpoint
CREATE INDEX "trend_scans_day_idx" ON "trend_scans" USING btree ("platform","day");