"use client"

import { useRef, useEffect, useCallback } from "react"
import { renderOffice, hitTest } from "@/lib/canvas/office-renderer"
import { useOffice } from "@/app/providers"
import { CANVAS_CONFIG } from "@/lib/canvas/isometric"

export const OfficeCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { agents, selectAgent } = useOffice()

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
      renderOffice(ctx, agents, CANVAS_CONFIG.baseWidth, CANVAS_CONFIG.baseHeight)
      requestAnimationFrame(render)
    }

    render()
  }, [agents])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const canvasRect = canvas.getBoundingClientRect()
      const scaleX = CANVAS_CONFIG.baseWidth / canvasRect.width
      const scaleY = CANVAS_CONFIG.baseHeight / canvasRect.height
      const x = (e.clientX - canvasRect.left) * scaleX
      const y = (e.clientY - canvasRect.top) * scaleY

      const result = hitTest(x, y, agents)

      if (result.type === "agent") {
        selectAgent(result.agentId)
      } else if (result.type === "meeting_room") {
        console.log("Meeting room clicked — Phase 2")
      } else {
        selectAgent(null)
      }
    },
    [agents, selectAgent]
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
