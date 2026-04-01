import { create } from "zustand"
import type { MeetingMessage } from "@ozap-office/shared"

type MeetingStatus = "idle" | "starting" | "active" | "concluding" | "completed"

type MeetingStore = {
  meetingId: string | null
  status: MeetingStatus
  topic: string | null
  messages: MeetingMessage[]
  agentTyping: Record<string, boolean>
  setMeetingId: (id: string | null) => void
  setStatus: (status: MeetingStatus) => void
  setTopic: (topic: string | null) => void
  addMessage: (message: MeetingMessage) => void
  setMessages: (messages: MeetingMessage[]) => void
  setAgentTyping: (agentId: string, typing: boolean) => void
  reset: () => void
}

export const useMeetingStore = create<MeetingStore>((set) => ({
  meetingId: null,
  status: "idle",
  topic: null,
  messages: [],
  agentTyping: {},
  setMeetingId: (id) => set({ meetingId: id }),
  setStatus: (status) => set({ status }),
  setTopic: (topic) => set({ topic }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  setAgentTyping: (agentId, typing) =>
    set((state) => ({ agentTyping: { ...state.agentTyping, [agentId]: typing } })),
  reset: () =>
    set({ meetingId: null, status: "idle", topic: null, messages: [], agentTyping: {} }),
}))
