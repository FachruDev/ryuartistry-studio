CREATE TYPE "public"."agent_role" AS ENUM('rina', 'shion', 'lukas', 'linda', 'kechlyn', 'admin');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('open', 'executing', 'done', 'halted');--> statement-breakpoint
CREATE TYPE "public"."failure_diagnosis" AS ENUM('execution', 'infeasible', 'weak_idea');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('idea_pending', 'idea_review', 'idea_revision', 'storyboard_pending', 'storyboard_review', 'executing', 'auto_check', 'final_review', 'exec_revision', 'publish_prep', 'awaiting_approval', 'scheduled', 'published', 'archived', 'halted');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('adobe_stock', 'facebook_reels');--> statement-breakpoint
CREATE TYPE "public"."product_line" AS ENUM('image', 'reel');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('awaiting_approval', 'approved', 'rejected', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."report_level" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."review_target" AS ENUM('idea', 'storyboard', 'asset');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "agent_role" NOT NULL,
	"model" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"s3_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"duration_sec" real,
	"phash" text,
	"auto_check" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"line" "product_line" NOT NULL,
	"day" date NOT NULL,
	"research_report_id" uuid,
	"ideas_attempted" smallint DEFAULT 0 NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"status" "cycle_status" DEFAULT 'open' NOT NULL,
	"halt_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_graveyard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"platform" "platform" NOT NULL,
	"line" "product_line" NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "review_target" NOT NULL,
	"content" jsonb NOT NULL,
	"author_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"line" "product_line" NOT NULL,
	"status" "job_status" DEFAULT 'idea_pending' NOT NULL,
	"idea_number" smallint NOT NULL,
	"idea_revision_count" smallint DEFAULT 0 NOT NULL,
	"storyboard_revision_count" smallint DEFAULT 0 NOT NULL,
	"exec_revision_count" smallint DEFAULT 0 NOT NULL,
	"returned_from_exec" boolean DEFAULT false NOT NULL,
	"last_idea_score" real,
	"archive_reason" text,
	"archive_stage" text,
	"claimed_by" uuid,
	"claimed_until" timestamp with time zone,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"revenue_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"title" text NOT NULL,
	"caption" text,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"category" text,
	"ai_label" boolean NOT NULL,
	"scheduled_for" timestamp with time zone,
	"status" "publication_status" DEFAULT 'awaiting_approval' NOT NULL,
	"reviewer_note" text,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"topic" text NOT NULL,
	"keywords" text[] NOT NULL,
	"demand_score" smallint NOT NULL,
	"competition_score" smallint NOT NULL,
	"seasonality" text NOT NULL,
	"sources" jsonb NOT NULL,
	"confidence" smallint NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" "report_level" NOT NULL,
	"platform" "platform" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"summary" text NOT NULL,
	"opportunities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}' NOT NULL,
	"child_report_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"day" date NOT NULL,
	"slot" smallint NOT NULL,
	"model" text NOT NULL,
	"agent_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"target" "review_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reviewer_agent_id" uuid,
	"rubric_id" text NOT NULL,
	"rubric_version" text NOT NULL,
	"gates" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"feedback" jsonb NOT NULL,
	"summary" text NOT NULL,
	"final_score" real NOT NULL,
	"passed" boolean NOT NULL,
	"diagnosis" "failure_diagnosis",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"from_status" "job_status",
	"to_status" "job_status" NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"job_id" uuid,
	"description" text NOT NULL,
	"cost_usd" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_research_report_id_research_reports_id_fk" FOREIGN KEY ("research_report_id") REFERENCES "public"."research_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_graveyard" ADD CONSTRAINT "idea_graveyard_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_claimed_by_agents_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance" ADD CONSTRAINT "performance_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_session_id_research_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."research_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transitions" ADD CONSTRAINT "transitions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_costs" ADD CONSTRAINT "usage_costs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_costs" ADD CONSTRAINT "usage_costs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_cycle_idx" ON "jobs" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "research_findings_platform_idx" ON "research_findings" USING btree ("platform","created_at");--> statement-breakpoint
CREATE INDEX "research_reports_lookup_idx" ON "research_reports" USING btree ("platform","level","period_start");--> statement-breakpoint
CREATE INDEX "reviews_job_idx" ON "reviews" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "transitions_job_idx" ON "transitions" USING btree ("job_id","created_at");