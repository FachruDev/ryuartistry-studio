DROP INDEX "research_reports_lookup_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "performance_day_uq" ON "performance" USING btree ("publication_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "research_reports_period_uq" ON "research_reports" USING btree ("platform","level","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "research_sessions_slot_uq" ON "research_sessions" USING btree ("platform","day","slot","model");