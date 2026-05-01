"use client"

import { useState } from "react"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useApprovals } from "@/lib/queries/approval-queries"
import { ApprovalsPanel } from "./approvals-panel"

const StatusDot = ({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: string
}) => (
  <div className="flex items-center gap-2">
    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    <span className="font-mono text-[11px]">
      <span style={{ color }}>{count}</span>
      <span className="text-mute ml-1">{label}</span>
    </span>
  </div>
)

export const StatusBar = () => {
  const agents = useAgentStore((s) => s.agents)
  const { data: approvals = [] } = useApprovals()
  const [panelOpen, setPanelOpen] = useState(false)

  const counts = agents.reduce(
    (acc, a) => {
      if (a.status === "working" || a.status === "thinking") acc.working++
      else if (a.status === "waiting" || a.status === "waiting_approval") acc.waiting++
      else if (a.status === "error") acc.error++
      else acc.idle++
      return acc
    },
    { working: 0, waiting: 0, error: 0, idle: 0 }
  )

  return (
    <>
      <div className="h-9 bg-surface border-t border-edge flex items-center px-5 gap-6">
        <StatusDot count={counts.working} label="active" color="var(--color-sage)" />
        <StatusDot count={counts.waiting} label="pending" color="var(--color-ember)" />
        <StatusDot count={counts.error} label="errors" color="var(--color-coral)" />
        <StatusDot count={counts.idle} label="idle" color="var(--color-mute)" />

        {approvals.length > 0 && (
          <button
            onClick={() => setPanelOpen(true)}
            className="ml-auto px-2 py-1 rounded bg-amber-500/20 text-amber-700 text-[11px] font-semibold hover:bg-amber-500/30"
          >
            {approvals.length} pending approval{approvals.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <ApprovalsPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}
