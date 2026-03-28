"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { api } from "./api-client"
import type { AgentEvent } from "@ozap-office/shared"

export const useEvents = (agentId: string | null) => {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const activeTaskRunIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!agentId) {
      setEvents([])
      activeTaskRunIdRef.current = null
      return
    }

    api.getLatestRun(agentId)
      .then((run) => {
        activeTaskRunIdRef.current = run.id
        return api.getTaskRunEvents(agentId, run.id)
      })
      .then(setEvents)
      .catch(() => {
        setEvents([])
        activeTaskRunIdRef.current = null
      })
  }, [agentId])

  const addEvent = useCallback(
    (event: AgentEvent) => {
      if (activeTaskRunIdRef.current && event.taskRunId !== activeTaskRunIdRef.current) {
        activeTaskRunIdRef.current = event.taskRunId
        setEvents([event])
        return
      }
      if (!activeTaskRunIdRef.current) {
        activeTaskRunIdRef.current = event.taskRunId
      }
      setEvents((prev) => [...prev, event])
    },
    []
  )

  return { events, addEvent, activeTaskRunId: activeTaskRunIdRef.current }
}
