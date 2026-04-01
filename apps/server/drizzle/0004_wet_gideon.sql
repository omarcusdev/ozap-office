CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site" text NOT NULL,
	"page_path" text NOT NULL,
	"referrer" text,
	"referrer_source" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"screen_width" integer,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "page_views_site_created_idx" ON "page_views" USING btree ("site","created_at");--> statement-breakpoint
CREATE INDEX "page_views_source_idx" ON "page_views" USING btree ("referrer_source","created_at");