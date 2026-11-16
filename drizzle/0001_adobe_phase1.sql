ALTER TYPE "public"."publication_status" ADD VALUE 'submitted' BEFORE 'published';--> statement-breakpoint
ALTER TYPE "public"."publication_status" ADD VALUE 'platform_rejected';--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "human_score" smallint;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "agent_score" real;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "platform_note" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "submitted_at" timestamp with time zone;