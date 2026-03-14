export const AGENT_STATUSES = ["idle", "working", "thinking", "waiting", "meeting", "error"] as const

export const EVENT_TYPES = [
  "thinking",
  "tool_call",
  "tool_result",
  "message",
  "approval_needed",
  "completed",
  "error",
] as const

export const TASK_RUN_TRIGGERS = ["cron", "event", "meeting", "manual"] as const
export const TASK_RUN_STATUSES = ["running", "completed", "failed", "waiting_approval"] as const
export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const
export const MEETING_STATUSES = ["active", "completed"] as const
