ALTER TABLE "approvals" DROP CONSTRAINT "approvals_task_run_id_task_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "approvals" DROP CONSTRAINT "approvals_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "payload" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "tool_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "tool_input" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "suspended_messages" jsonb;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_run_id_task_runs_id_fk" FOREIGN KEY ("task_run_id") REFERENCES "public"."task_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;