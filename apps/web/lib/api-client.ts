import type { AgentConfig, AgentEvent, Approval, Meeting, MeetingMessage, TaskRun } from "@ozap-office/shared"

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
    request<{ userMessage: MeetingMessage; leaderResponse: string }>(`/api/meetings/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
}
