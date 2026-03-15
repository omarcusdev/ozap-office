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

type AnimationType = "idle" | "walk" | "typing" | "reading"
type Direction = "down" | "up" | "right" | "left"

type AnimationState = {
  type: AnimationType
  direction: Direction
  frame: number
  timer: number
}

export type RenderAgent = {
  x: number
  y: number
  animation: AnimationType
  direction: Direction
  frame: number
  paletteIndex: number
  hueShift: number
}

type WaypointState = {
  waypoints: Array<{ x: number; y: number }>
  currentIndex: number
  progress: number
  startDelay: number
  started: boolean
}

const MOVE_SPEED = 0.15
const STAGGER_DELAY_MS = 400
const HUE_SHIFT_MIN = 45
const HUE_SHIFT_RANGE = 271

const WALK_FRAME_DURATION = 0.15
const WALK_CYCLE_LENGTH = 4
const ACTION_FRAME_DURATION = 0.3
const ACTION_CYCLE_LENGTH = 2

const statusToAnimation = (status: AgentStatus, isMoving: boolean): AnimationType => {
  if (isMoving) return "walk"
  if (status === "working") return "typing"
  if (status === "thinking") return "reading"
  return "idle"
}

const computeDirection = (dx: number, dy: number): Direction => {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left"
  return dy > 0 ? "down" : "up"
}

export const useAgents = () => {
  const [agents, setAgents] = useState<AgentState[]>([])
  const [loading, setLoading] = useState(true)
  const [inMeeting, setInMeeting] = useState(false)
  const renderPositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const originalPositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const waypointStatesRef = useRef<Record<string, WaypointState>>({})
  const animationStatesRef = useRef<Record<string, AnimationState>>({})
  const paletteAssignmentsRef = useRef<Record<string, { paletteIndex: number; hueShift: number }>>({})
  const lastFrameTimeRef = useRef<number>(0)
  const previousPositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const animationStartRef = useRef<number>(0)
  const [renderTick, setRenderTick] = useState(0)

  useEffect(() => {
    api.getAgents().then((data) => {
      const agentData = data as unknown as AgentState[]
      setAgents(agentData)
      setLoading(false)
      const positions: Record<string, { x: number; y: number }> = {}
      const originals: Record<string, { x: number; y: number }> = {}
      for (const agent of agentData) {
        positions[agent.id] = { x: agent.positionX, y: agent.positionY }
        originals[agent.id] = { x: agent.positionX, y: agent.positionY }
      }
      renderPositionsRef.current = positions
      originalPositionsRef.current = originals

      const assignments: Record<string, { paletteIndex: number; hueShift: number }> = {}
      const paletteCounts = Array(6).fill(0)

      for (let i = 0; i < agentData.length; i++) {
        if (i < 6) {
          assignments[agentData[i].id] = { paletteIndex: i, hueShift: 0 }
          paletteCounts[i]++
        } else {
          const minCount = Math.min(...paletteCounts)
          const leastUsedIdx = paletteCounts.indexOf(minCount)
          const hueShift = HUE_SHIFT_MIN + Math.floor(Math.random() * HUE_SHIFT_RANGE)
          assignments[agentData[i].id] = { paletteIndex: leastUsedIdx, hueShift }
          paletteCounts[leastUsedIdx]++
        }
      }
      paletteAssignmentsRef.current = assignments
    })
  }, [])

  useEffect(() => {
    const animate = (now: number) => {
      const positions = renderPositionsRef.current
      const wpStates = waypointStatesRef.current
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
      }

      const lastTime = lastFrameTimeRef.current
      const deltaTime = lastTime === 0 ? 0 : (now - lastTime) / 1000
      lastFrameTimeRef.current = now

      const animStates = animationStatesRef.current
      const prevPositions = previousPositionsRef.current

      for (const id of Object.keys(positions)) {
        const pos = positions[id]
        if (!pos) continue

        const prev = prevPositions[id]
        const dx = prev ? pos.x - prev.x : 0
        const dy = prev ? pos.y - prev.y : 0
        const isMoving = Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001

        const agentStatus = agents.find((a) => a.id === id)?.status ?? "idle"
        const animType = statusToAnimation(agentStatus, isMoving)

        const currentState = animStates[id] ?? { type: "idle", direction: "down", frame: 0, timer: 0 }

        const direction: Direction = isMoving
          ? computeDirection(dx, dy)
          : (agentStatus === "working" || agentStatus === "thinking")
            ? "down"
            : currentState.direction

        if (currentState.type !== animType) {
          animStates[id] = { type: animType, direction, frame: 0, timer: 0 }
        } else {
          currentState.direction = direction
          currentState.timer += deltaTime

          if (animType === "walk") {
            if (currentState.timer >= WALK_FRAME_DURATION) {
              currentState.timer -= WALK_FRAME_DURATION
              currentState.frame = (currentState.frame + 1) % WALK_CYCLE_LENGTH
            }
          } else if (animType === "typing" || animType === "reading") {
            if (currentState.timer >= ACTION_FRAME_DURATION) {
              currentState.timer -= ACTION_FRAME_DURATION
              currentState.frame = (currentState.frame + 1) % ACTION_CYCLE_LENGTH
            }
          } else {
            currentState.frame = 0
            currentState.timer = 0
          }

          animStates[id] = currentState
        }

        prevPositions[id] = { x: pos.x, y: pos.y }
      }

      setRenderTick((t) => t + 1)
      requestAnimationFrame(animate)
    }

    const frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [agents])

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

  const getRenderPositions = useCallback((): Record<string, RenderAgent> => {
    const positions = renderPositionsRef.current
    const animStates = animationStatesRef.current
    const palettes = paletteAssignmentsRef.current
    const result: Record<string, RenderAgent> = {}

    for (const id of Object.keys(positions)) {
      const pos = positions[id]
      if (!pos) continue
      const anim = animStates[id] ?? { type: "idle" as const, direction: "down" as const, frame: 0, timer: 0 }
      const palette = palettes[id] ?? { paletteIndex: 0, hueShift: 0 }

      result[id] = {
        x: pos.x,
        y: pos.y,
        animation: anim.type,
        direction: anim.direction,
        frame: anim.frame,
        paletteIndex: palette.paletteIndex,
        hueShift: palette.hueShift,
      }
    }

    return result
  }, [renderTick])

  return { agents, loading, updateAgentStatus, inMeeting, callMeeting, endMeeting, getRenderPositions }
}
