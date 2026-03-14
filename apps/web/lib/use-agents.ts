"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

export type RenderPosition = { x: number; y: number }

const MEETING_SEATS: RenderPosition[] = [
  { x: 14, y: 12 },
  { x: 12, y: 13 },
  { x: 16, y: 13 },
  { x: 12, y: 15 },
  { x: 16, y: 15 },
  { x: 14, y: 16 },
]

const LERP_SPEED = 0.03

export const useAgents = () => {
  const [agents, setAgents] = useState<AgentState[]>([])
  const [loading, setLoading] = useState(true)
  const [inMeeting, setInMeeting] = useState(false)
  const renderPositionsRef = useRef<Record<string, RenderPosition>>({})
  const targetPositionsRef = useRef<Record<string, RenderPosition>>({})
  const originalPositionsRef = useRef<Record<string, RenderPosition>>({})
  const [renderTick, setRenderTick] = useState(0)
  const animatingRef = useRef(false)

  useEffect(() => {
    api.getAgents().then((data) => {
      const agentData = data as unknown as AgentState[]
      setAgents(agentData)
      setLoading(false)
      const positions: Record<string, RenderPosition> = {}
      const originals: Record<string, RenderPosition> = {}
      for (const agent of agentData) {
        positions[agent.id] = { x: agent.positionX, y: agent.positionY }
        originals[agent.id] = { x: agent.positionX, y: agent.positionY }
      }
      renderPositionsRef.current = positions
      targetPositionsRef.current = { ...positions }
      originalPositionsRef.current = originals
    })
  }, [])

  useEffect(() => {
    const animate = () => {
      const positions = renderPositionsRef.current
      const targets = targetPositionsRef.current
      const ids = Object.keys(positions)
      const needsUpdate = ids.some((id) => {
        const pos = positions[id]
        const target = targets[id]
        if (!pos || !target) return false
        return Math.abs(pos.x - target.x) > 0.01 || Math.abs(pos.y - target.y) > 0.01
      })

      if (needsUpdate) {
        animatingRef.current = true
        for (const id of ids) {
          const pos = positions[id]
          const target = targets[id]
          if (!pos || !target) continue
          pos.x += (target.x - pos.x) * LERP_SPEED
          pos.y += (target.y - pos.y) * LERP_SPEED
          if (Math.abs(pos.x - target.x) < 0.01) pos.x = target.x
          if (Math.abs(pos.y - target.y) < 0.01) pos.y = target.y
        }
        setRenderTick((t) => t + 1)
      } else {
        animatingRef.current = false
      }

      requestAnimationFrame(animate)
    }

    const frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [])

  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, status } : a))
    )
  }, [])

  const callMeeting = useCallback(() => {
    const targets = targetPositionsRef.current
    const agentIds = Object.keys(renderPositionsRef.current)
    agentIds.forEach((id, index) => {
      const seat = MEETING_SEATS[index % MEETING_SEATS.length]
      targets[id] = { x: seat.x, y: seat.y }
    })
    setInMeeting(true)
  }, [])

  const endMeeting = useCallback(() => {
    const targets = targetPositionsRef.current
    const originals = originalPositionsRef.current
    for (const id of Object.keys(targets)) {
      const original = originals[id]
      if (original) targets[id] = { x: original.x, y: original.y }
    }
    setInMeeting(false)
  }, [])

  const getRenderPositions = useCallback((): Record<string, RenderPosition> => {
    return renderPositionsRef.current
  }, [renderTick])

  return { agents, loading, updateAgentStatus, inMeeting, callMeeting, endMeeting, getRenderPositions }
}
