"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "./api-client"
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

export const useAgents = () => {
  const [agents, setAgents] = useState<AgentState[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAgents().then((data) => {
      setAgents(data as unknown as AgentState[])
      setLoading(false)
    })
  }, [])

  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, status } : a))
    )
  }, [])

  return { agents, loading, updateAgentStatus }
}
