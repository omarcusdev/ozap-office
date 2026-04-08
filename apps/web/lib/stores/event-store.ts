import { create } from "zustand"
import type { AgentEvent } from "@ozap-office/shared"

type TaskRunInfo = {
  trigger: string
  input: string | null
}

type EventStore = {
  events: AgentEvent[]
  activeTaskRunId: string | null
  taskRunInfo: TaskRunInfo | null
  setEvents: (events: AgentEvent[]) => void
  addEvent: (event: AgentEvent) => boolean
  setActiveTaskRunId: (id: string | null) => void
  setTaskRunInfo: (info: TaskRunInfo | null) => void
  clearEvents: () => void
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  activeTaskRunId: null,
  taskRunInfo: null,
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
  setTaskRunInfo: (info) => set({ taskRunInfo: info }),
  clearEvents: () => set({ events: [], activeTaskRunId: null, taskRunInfo: null }),
}))
