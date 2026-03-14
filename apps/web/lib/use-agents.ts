"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { api } from "./api-client"
import { MEETING_ROUTES } from "./canvas/tile-map"
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

type WaypointState = {
  waypoints: RenderPosition[]
  currentIndex: number
  progress: number
  startDelay: number
  started: boolean
}

const MOVE_SPEED = 0.02
const STAGGER_DELAY_MS = 800

export const useAgents = () => {
  const [agents, setAgents] = useState<AgentState[]>([])
  const [loading, setLoading] = useState(true)
  const [inMeeting, setInMeeting] = useState(false)
  const renderPositionsRef = useRef<Record<string, RenderPosition>>({})
  const originalPositionsRef = useRef<Record<string, RenderPosition>>({})
  const waypointStatesRef = useRef<Record<string, WaypointState>>({})
  const animationStartRef = useRef<number>(0)
  const [renderTick, setRenderTick] = useState(0)

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
      originalPositionsRef.current = originals
    })
  }, [])

  useEffect(() => {
    const animate = () => {
      const positions = renderPositionsRef.current
      const wpStates = waypointStatesRef.current
      const now = performance.now()
      const agentIds = Object.keys(wpStates)

      if (agentIds.length > 0) {
        for (const id of agentIds) {
          const wp = wpStates[id]
          if (!wp || !positions[id]) continue

          if (!wp.started) {
            if (now - animationStartRef.current >= wp.startDelay) {
              wp.started = true
            } else {
              continue
            }
          }

          if (wp.currentIndex >= wp.waypoints.length - 1) continue

          const from = wp.waypoints[wp.currentIndex]
          const to = wp.waypoints[wp.currentIndex + 1]
          const dx = to.x - from.x
          const dy = to.y - from.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const speedAdjusted = MOVE_SPEED / Math.max(distance, 0.5)

          wp.progress += speedAdjusted

          if (wp.progress >= 1) {
            wp.progress = 0
            wp.currentIndex++
            positions[id] = { x: to.x, y: to.y }
          } else {
            positions[id] = {
              x: from.x + dx * wp.progress,
              y: from.y + dy * wp.progress,
            }
          }
        }
        setRenderTick((t) => t + 1)
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
    const wpStates: Record<string, WaypointState> = {}
    const positions = renderPositionsRef.current

    agents.forEach((agent, index) => {
      const route = MEETING_ROUTES[agent.name]
      if (!route) return

      const currentPos = positions[agent.id] ?? { x: agent.positionX, y: agent.positionY }
      const fullPath = [{ x: currentPos.x, y: currentPos.y }, ...route.path]

      wpStates[agent.id] = {
        waypoints: fullPath,
        currentIndex: 0,
        progress: 0,
        startDelay: index * STAGGER_DELAY_MS,
        started: false,
      }
    })

    waypointStatesRef.current = wpStates
    animationStartRef.current = performance.now()
    setInMeeting(true)
  }, [agents])

  const endMeeting = useCallback(() => {
    const wpStates: Record<string, WaypointState> = {}
    const positions = renderPositionsRef.current
    const originals = originalPositionsRef.current

    agents.forEach((agent, index) => {
      const route = MEETING_ROUTES[agent.name]
      if (!route) return

      const currentPos = positions[agent.id] ?? route.seat
      const original = originals[agent.id] ?? { x: agent.positionX, y: agent.positionY }
      const reversePath = [...route.path].reverse()
      const fullPath = [{ x: currentPos.x, y: currentPos.y }, ...reversePath, { x: original.x, y: original.y }]

      wpStates[agent.id] = {
        waypoints: fullPath,
        currentIndex: 0,
        progress: 0,
        startDelay: index * STAGGER_DELAY_MS,
        started: false,
      }
    })

    waypointStatesRef.current = wpStates
    animationStartRef.current = performance.now()
    setInMeeting(false)
  }, [agents])

  const getRenderPositions = useCallback((): Record<string, RenderPosition> => {
    return renderPositionsRef.current
  }, [renderTick])

  return { agents, loading, updateAgentStatus, inMeeting, callMeeting, endMeeting, getRenderPositions }
}
