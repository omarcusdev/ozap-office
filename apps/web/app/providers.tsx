"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useRef, useEffect, type ReactNode } from "react"
import { createWsClient } from "@/lib/ws-client"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useEventStore } from "@/lib/stores/event-store"
import { useMeetingStore } from "@/lib/stores/meeting-store"
import { useWsStore } from "@/lib/stores/ws-store"
import type { WsServerMessage } from "@ozap-office/shared"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const updateStatus = useAgentStore((s) => s.updateStatus)
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId)
  const addEvent = useEventStore((s) => s.addEvent)
  const addMeetingMessage = useMeetingStore((s) => s.addMessage)
  const setConnected = useWsStore((s) => s.setConnected)
  const selectedAgentIdRef = useRef(selectedAgentId)
  selectedAgentIdRef.current = selectedAgentId

  useEffect(() => {
    const handleMessage = (message: WsServerMessage) => {
      if (message.type === "agent_status") {
        updateStatus(message.payload.agentId, message.payload.status)
      } else if (message.type === "agent_event") {
        if (message.payload.agentId === selectedAgentIdRef.current) {
          addEvent(message.payload)
        }
      } else if (message.type === "meeting_message") {
        addMeetingMessage(message.payload)
      }
    }

    const client = createWsClient(handleMessage, setConnected)

    return () => {
      client.disconnect()
      setConnected(false)
    }
  }, [updateStatus, addEvent, addMeetingMessage, setConnected])

  return <>{children}</>
}

export const OfficeProvider = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <WebSocketProvider>{children}</WebSocketProvider>
  </QueryClientProvider>
)
