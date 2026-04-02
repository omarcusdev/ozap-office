import type { AgentConfig, AgentEvent, Approval, ConversationMessage, Meeting, MeetingMessage, TaskRun } from "@ozap-office/shared"

type ConversationSession = {
  id: string
  agentId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ""

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export const api = {
  getAgents: () => request<AgentConfig[]>("/api/agents"),
  getAgent: (id: string) => request<AgentConfig>(`/api/agents/${id}`),
  getAgentEvents: (id: string, after?: string) =>
    request<AgentEvent[]>(`/api/agents/${id}/events${after ? `?after=${after}` : ""}`),
  triggerAgent: (id: string, message?: string) =>
    request<{ taskRunId: string }>(`/api/agents/${id}/run`, { method: "POST", body: JSON.stringify({ message }) }),
  getApprovals: () => request<Approval[]>("/api/approvals"),
  decideApproval: (id: string, action: "approve" | "reject") =>
    request<{ status: string }>(`/api/approvals/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
  createMeeting: (topic?: string) =>
    request<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify({ topic }) }),
  getMeetingMessages: (id: string) => request<MeetingMessage[]>(`/api/meetings/${id}/messages`),
  sendMeetingMessage: (id: string, content: string) =>
    request<{ status: string }>(`/api/meetings/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
  getConversation: (agentId: string) =>
    request<ConversationMessage[]>(`/api/agents/${agentId}/conversation`),
  clearConversation: (agentId: string) =>
    request<{ status: string }>(`/api/agents/${agentId}/conversation`, { method: "DELETE" }),
  markAgentRead: (id: string) =>
    request<{ status: string }>(`/api/agents/${id}/read`, { method: "POST", body: JSON.stringify({}) }),
  getLatestRun: (agentId: string) =>
    request<TaskRun>(`/api/agents/${agentId}/latest-run`),
  getTaskRunEvents: (agentId: string, taskRunId: string) =>
    request<AgentEvent[]>(`/api/agents/${agentId}/events?taskRunId=${taskRunId}`),
  getSessions: (agentId: string) =>
    request<ConversationSession[]>(`/api/agents/${agentId}/sessions`),
  createSession: (agentId: string) =>
    request<ConversationSession>(`/api/agents/${agentId}/sessions`, { method: "POST", body: JSON.stringify({}) }),
  deleteSession: (agentId: string, sessionId: string) =>
    request<{ status: string }>(`/api/agents/${agentId}/sessions/${sessionId}`, { method: "DELETE" }),
  getSessionMessages: (agentId: string, sessionId: string) =>
    request<ConversationMessage[]>(`/api/agents/${agentId}/sessions/${sessionId}/messages`),
  completeMeeting: (meetingId: string) =>
    request<{ status: string }>(`/api/meetings/${meetingId}/complete`, { method: "POST", body: JSON.stringify({}) }),
}
