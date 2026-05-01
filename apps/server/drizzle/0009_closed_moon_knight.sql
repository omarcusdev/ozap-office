ALTER TABLE "page_views" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "gclid" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "ttclid" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "msclkid" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "first_touch" jsonb;