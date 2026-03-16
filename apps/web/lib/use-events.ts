"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "./api-client"
import type { AgentEvent } from "@ozap-office/shared"

export const useEvents = (agentId: string | null) => {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [activeTaskRunId, setActiveTaskRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!agentId) {
      setEvents([])
      setActiveTaskRunId(null)
      return
    }

    api.getLatestRun(agentId)
      .then((run) => {
        setActiveTaskRunId(run.id)
        return api.getTaskRunEvents(agentId, run.id)
      })
      .then(setEvents)
      .catch(() => {
        setEvents([])
        setActiveTaskRunId(null)
      })
  }, [agentId])

  const addEvent = useCallback(
    (event: AgentEvent) => {
      if (activeTaskRunId && event.taskRunId !== activeTaskRunId) {
        setActiveTaskRunId(event.taskRunId)
        setEvents([event])
        return
      }
      setEvents((prev) => [...prev, event])
    },
    [activeTaskRunId]
  )

  return { events, addEvent, activeTaskRunId }
}
