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
  agentId: uuid("agent_id").references(() => agents.id),
  round: integer("round").default(1),
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

export const conversationSessions = pgTable(
  "conversation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversation_sessions_agent_idx").on(table.agentId, table.updatedAt),
  ]
)

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    sessionId: uuid("session_id").references(() => conversationSessions.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversation_messages_agent_created_idx").on(table.agentId, table.createdAt),
  ]
)

export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    site: text("site").notNull(),
    pagePath: text("page_path").notNull(),
    referrer: text("referrer"),
    referrerSource: text("referrer_source").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    screenWidth: integer("screen_width"),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("page_views_site_created_idx").on(table.site, table.createdAt),
    index("page_views_source_idx").on(table.referrerSource, table.createdAt),
  ]
)

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    type: text("type").notNull(),
    key: text("key"),
    category: text("category"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_memories_agent_type_idx").on(table.agentId, table.type),
    index("agent_memories_agent_category_idx").on(table.agentId, table.category),
  ]
)
