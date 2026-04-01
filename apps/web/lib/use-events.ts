"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { api } from "./api-client"
import type { AgentEvent } from "@ozap-office/shared"

export const useEvents = (agentId: string | null, onNewTaskRun?: () => Promise<void> | void) => {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const activeTaskRunIdRef = useRef<string | null>(null)
  const onNewTaskRunRef = useRef(onNewTaskRun)
  onNewTaskRunRef.current = onNewTaskRun

  useEffect(() => {
    if (!agentId) {
      setEvents([])
      activeTaskRunIdRef.current = null
      return
    }

    api
      .getLatestRun(agentId)
      .then((run) => {
        if (run.status === "running" || run.status === "waiting_approval") {
          activeTaskRunIdRef.current = run.id
          return api.getTaskRunEvents(agentId, run.id)
        }
        activeTaskRunIdRef.current = null
        return []
      })
      .then(setEvents)
      .catch(() => {
        setEvents([])
        activeTaskRunIdRef.current = null
      })
  }, [agentId])

  const addEvent = useCallback((event: AgentEvent) => {
    if (activeTaskRunIdRef.current && event.taskRunId !== activeTaskRunIdRef.current) {
      activeTaskRunIdRef.current = event.taskRunId
      const result = onNewTaskRunRef.current?.()
      if (result instanceof Promise) {
        result.finally(() => setEvents([event]))
      } else {
        setEvents([event])
      }
      return
    }
    if (!activeTaskRunIdRef.current) {
      activeTaskRunIdRef.current = event.taskRunId
    }
    setEvents((prev) => [...prev, event])
  }, [])

  return { events, addEvent }
}
