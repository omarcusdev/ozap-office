"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "./api-client"
import type { AgentEvent } from "@ozap-office/shared"

export const useEvents = (agentId: string | null) => {
  const [events, setEvents] = useState<AgentEvent[]>([])

  useEffect(() => {
    if (!agentId) {
      setEvents([])
      return
    }

    api.getAgentEvents(agentId).then(setEvents)
  }, [agentId])

  const addEvent = useCallback((event: AgentEvent) => {
    setEvents((prev) => [...prev, event])
  }, [])

  return { events, addEvent }
}
