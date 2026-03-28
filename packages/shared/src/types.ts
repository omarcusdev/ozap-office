export type AgentStatus = "idle" | "working" | "thinking" | "waiting" | "meeting" | "error" | "has_report"

export type AgentConfig = {
  id: string
  name: string
  role: string
  systemPrompt: string
  tools: ToolDefinition[]
  schedule: string | null
  cronPrompt: string | null
  color: string
  position: { x: number; y: number }
  status: AgentStatus
  createdAt: Date
  updatedAt: Date
}

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type TaskRunTrigger = "cron" | "event" | "meeting" | "manual"
export type TaskRunStatus = "running" | "completed" | "failed" | "waiting_approval"

export type TaskRun = {
  id: string
  agentId: string
  trigger: TaskRunTrigger
  status: TaskRunStatus
  input: unknown
  output: unknown
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}

export type AgentEventType =
  | "user_message"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "message"
  | "approval_needed"
  | "completed"
  | "error"

export type AgentEvent = {
  id: string
  agentId: string
  taskRunId: string
  type: AgentEventType
  content: string
  metadata: Record<string, unknown>
  timestamp: Date
}

export type ApprovalStatus = "pending" | "approved" | "rejected"

export type Approval = {
  id: string
  taskRunId: string
  agentId: string
  payload: unknown
  status: ApprovalStatus
  decidedAt: Date | null
  createdAt: Date
}

export type MeetingStatus = "active" | "completed"

export type Meeting = {
  id: string
  topic: string | null
  status: MeetingStatus
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}

export type MeetingMessage = {
  id: string
  meetingId: string
  sender: string
  content: string
  metadata: Record<string, unknown>
  timestamp: Date
}

export type WsServerMessage =
  | { type: "agent_event"; payload: AgentEvent }
  | { type: "agent_status"; payload: { agentId: string; status: AgentStatus } }
  | { type: "meeting_message"; payload: MeetingMessage }

export type WsClientMessage =
  | { type: "subscribe"; payload: { agentId: string } }
  | { type: "unsubscribe"; payload: { agentId: string } }

export type AgentMemoryType = "core" | "archival"

export type AgentMemory = {
  id: string
  agentId: string
  type: AgentMemoryType
  key: string | null
  category: string | null
  content: string
  createdAt: Date
  updatedAt: Date
}
