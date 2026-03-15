"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { renderOffice, hitTest } from "@/lib/canvas/office-renderer"
import type { AgentRenderData } from "@/lib/canvas/office-renderer"
import { loadAllAssets, type AssetBundle } from "@/lib/canvas/sprite-loader"
import { useOffice } from "@/app/providers"
import { CANVAS_CONFIG } from "@/lib/canvas/coordinates"

const buildAnimatedAgents = (
  agents: Array<{ id: string; name: string; color: string; positionX: number; positionY: number; status: string }>,
  positions: Record<string, { x: number; y: number; animation: string; direction: string; frame: number; paletteIndex: number; hueShift: number }>
): AgentRenderData[] =>
  agents.map((a) => {
    const pos = positions[a.id]
    return pos
      ? {
          id: a.id,
          name: a.name,
          color: a.color,
          positionX: pos.x,
          positionY: pos.y,
          status: a.status as AgentRenderData["status"],
          paletteIndex: pos.paletteIndex,
          animation: pos.animation as AgentRenderData["animation"],
          direction: pos.direction as AgentRenderData["direction"],
          frame: pos.frame,
        }
      : {
          id: a.id,
          name: a.name,
          color: a.color,
          positionX: a.positionX,
          positionY: a.positionY,
          status: a.status as AgentRenderData["status"],
          paletteIndex: 0,
          animation: "idle" as const,
          direction: "down" as const,
          frame: 0,
        }
  })

export const OfficeCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameIdRef = useRef<number>(0)
  const { agents, selectAgent, getRenderPositions } = useOffice()
  const [assets, setAssets] = useState<AssetBundle | null>(null)

  useEffect(() => {
    loadAllAssets().then(setAssets)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_CONFIG.baseWidth * dpr
    canvas.height = CANVAS_CONFIG.baseHeight * dpr
    ctx.scale(dpr, dpr)
    ctx.imageSmoothingEnabled = false

    const render = () => {
      if (!assets) {
        ctx.clearRect(0, 0, CANVAS_CONFIG.baseWidth, CANVAS_CONFIG.baseHeight)
        ctx.fillStyle = "#1a1a2e"
        ctx.fillRect(0, 0, CANVAS_CONFIG.baseWidth, CANVAS_CONFIG.baseHeight)
        ctx.fillStyle = "#888888"
        ctx.font = "14px monospace"
        ctx.textAlign = "center"
        ctx.fillText("Loading office...", CANVAS_CONFIG.baseWidth / 2, CANVAS_CONFIG.baseHeight / 2)
        frameIdRef.current = requestAnimationFrame(render)
        return
      }

      const positions = getRenderPositions()
      const animatedAgents = buildAnimatedAgents(agents, positions)
      renderOffice(ctx, animatedAgents, assets, CANVAS_CONFIG.baseWidth, CANVAS_CONFIG.baseHeight)
      frameIdRef.current = requestAnimationFrame(render)
    }

    frameIdRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameIdRef.current)
  }, [agents, getRenderPositions, assets])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const canvasRect = canvas.getBoundingClientRect()
      const scaleX = CANVAS_CONFIG.baseWidth / canvasRect.width
      const scaleY = CANVAS_CONFIG.baseHeight / canvasRect.height
      const x = (e.clientX - canvasRect.left) * scaleX
      const y = (e.clientY - canvasRect.top) * scaleY

      const positions = getRenderPositions()
      const animatedAgents = buildAnimatedAgents(agents, positions)

      const result = hitTest(x, y, animatedAgents)

      if (result.type === "agent") {
        selectAgent(result.agentId)
      } else {
        selectAgent(null)
      }
    },
    [agents, selectAgent, getRenderPositions]
  )

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        width: "100%",
        maxWidth: CANVAS_CONFIG.baseWidth,
        height: "auto",
        aspectRatio: `${CANVAS_CONFIG.baseWidth} / ${CANVAS_CONFIG.baseHeight}`,
        cursor: "pointer",
        imageRendering: "pixelated",
      }}
    />
  )
}
