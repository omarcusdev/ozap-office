CREATE TABLE "price_test_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"order" integer NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"sales_count" integer,
	"total_revenue" integer,
	"cakto_revenue" integer,
	"pix_revenue" integer,
	"pix_paid_snapshot_start" integer,
	"pix_paid_snapshot_end" integer
);
--> statement-breakpoint
CREATE TABLE "price_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"winner_tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_test_variants" ADD CONSTRAINT "price_test_variants_test_id_price_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."price_tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tests" ADD CONSTRAINT "price_tests_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_test_variants_test_idx" ON "price_test_variants" USING btree ("test_id","order");