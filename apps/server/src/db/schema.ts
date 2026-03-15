import { sql } from "drizzle-orm"
import { pgTable, uuid, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core"

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  tools: jsonb("tools").notNull().default(sql`'[]'`),
  schedule: text("schedule"),
  cronPrompt: text("cron_prompt"),
  color: text("color").notNull(),
  positionX: integer("position_x").notNull(),
  positionY: integer("position_y").notNull(),
  status: text("status").notNull().default("idle"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const taskRuns = pgTable(
  "task_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("task_runs_agent_created_idx").on(table.agentId, table.createdAt),
  ]
)

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    taskRunId: uuid("task_run_id").notNull().references(() => taskRuns.id),
    type: text("type").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'`),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("events_agent_timestamp_idx").on(table.agentId, table.timestamp),
    index("events_task_run_idx").on(table.taskRunId),
  ]
)

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic"),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const meetingMessages = pgTable("meeting_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  sender: text("sender").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").default(sql`'{}'`),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
})

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskRunId: uuid("task_run_id").notNull().references(() => taskRuns.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
