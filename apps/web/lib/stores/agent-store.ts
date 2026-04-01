import { create } from "zustand"
import type { AgentStatus } from "@ozap-office/shared"

type AgentState = {
  id: string
  name: string
  role: string
  color: string
  positionX: number
  positionY: number
  status: AgentStatus
}

type AgentStore = {
  agents: AgentState[]
  loading: boolean
  selectedAgentId: string | null
  setAgents: (agents: AgentState[]) => void
  setLoading: (loading: boolean) => void
  selectAgent: (id: string | null) => void
  updateStatus: (agentId: string, status: AgentStatus) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: true,
  selectedAgentId: null,
  setAgents: (agents) => set({ agents, loading: false }),
  setLoading: (loading) => set({ loading }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  updateStatus: (agentId, status) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a
      ),
    })),
}))
