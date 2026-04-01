import { create } from "zustand"
import type { ConversationMessage } from "@ozap-office/shared"

export type ConversationSession = {
  id: string
  agentId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}

type ConversationStore = {
  sessions: ConversationSession[]
  activeSessionId: string | null
  messages: ConversationMessage[]
  setSessions: (sessions: ConversationSession[]) => void
  setActiveSessionId: (id: string | null) => void
  setMessages: (messages: ConversationMessage[]) => void
  addSession: (session: ConversationSession) => void
  removeSession: (id: string) => void
}

export const useConversationStore = create<ConversationStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      messages: state.activeSessionId === id ? [] : state.messages,
    })),
}))
