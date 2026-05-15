CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"amount_brl_cents" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"external_id" text NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ledger_entries_kind_date_idx" ON "ledger_entries" USING btree ("kind","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_source_extid_unique" ON "ledger_entries" USING btree ("source","external_id");--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_entries_source_extid_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_source_extid_unique" ON "ledger_entries" ("source","external_id");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_kind_check" CHECK (kind IN ('revenue','cost'));--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currency_check" CHECK (currency IN ('BRL','USD'));