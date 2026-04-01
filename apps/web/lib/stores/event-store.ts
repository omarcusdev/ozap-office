import { create } from "zustand"
import type { AgentEvent } from "@ozap-office/shared"

type EventStore = {
  events: AgentEvent[]
  activeTaskRunId: string | null
  setEvents: (events: AgentEvent[]) => void
  addEvent: (event: AgentEvent) => boolean
  setActiveTaskRunId: (id: string | null) => void
  clearEvents: () => void
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  activeTaskRunId: null,
  setEvents: (events) => set({ events }),
  addEvent: (event) => {
    const { activeTaskRunId } = get()
    if (activeTaskRunId && event.taskRunId !== activeTaskRunId) {
      set({ events: [event], activeTaskRunId: event.taskRunId })
      return true
    }
    if (!activeTaskRunId) {
      set({ activeTaskRunId: event.taskRunId })
    }
    set((state) => ({ events: [...state.events, event] }))
    return false
  },
  setActiveTaskRunId: (id) => set({ activeTaskRunId: id }),
  clearEvents: () => set({ events: [], activeTaskRunId: null }),
}))
