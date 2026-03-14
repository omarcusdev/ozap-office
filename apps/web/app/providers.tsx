"use client"

import { createContext, useContext, useCallback, useState, type ReactNode } from "react"
import { useWebSocket } from "@/lib/use-websocket"
import { useAgents, type RenderPosition } from "@/lib/use-agents"
import { useEvents } from "@/lib/use-events"
import type { WsServerMessage, AgentEvent } from "@ozap-office/shared"

type OfficeContextType = {
  agents: ReturnType<typeof useAgents>["agents"]
  loading: boolean
  selectedAgentId: string | null
  selectAgent: (id: string | null) => void
  events: AgentEvent[]
  inMeeting: boolean
  callMeeting: () => void
  endMeeting: () => void
  getRenderPositions: () => Record<string, RenderPosition>
}

const OfficeContext = createContext<OfficeContextType | null>(null)

export const useOffice = () => {
  const ctx = useContext(OfficeContext)
  if (!ctx) throw new Error("useOffice must be used within OfficeProvider")
  return ctx
}

export const OfficeProvider = ({ children }: { children: ReactNode }) => {
  const { agents, loading, updateAgentStatus, inMeeting, callMeeting, endMeeting, getRenderPositions } = useAgents()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const { events, addEvent } = useEvents(selectedAgentId)

  const handleWsMessage = useCallback(
    (message: WsServerMessage) => {
      if (message.type === "agent_status") {
        updateAgentStatus(message.payload.agentId, message.payload.status)
      } else if (message.type === "agent_event") {
        if (message.payload.agentId === selectedAgentId) {
          addEvent(message.payload)
        }
      }
    },
    [updateAgentStatus, addEvent, selectedAgentId]
  )

  useWebSocket(handleWsMessage)

  return (
    <OfficeContext.Provider
      value={{
        agents,
        loading,
        selectedAgentId,
        selectAgent: setSelectedAgentId,
        events,
        inMeeting,
        callMeeting,
        endMeeting,
        getRenderPositions,
      }}
    >
      {children}
    </OfficeContext.Provider>
  )
}
