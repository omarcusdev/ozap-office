"use client"

import { useAgentStore } from "@/lib/stores/agent-store"

const StatusDot = ({ count, label, color }: { count: number; label: string; color: string }) => (
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

  const counts = agents.reduce(
    (acc, a) => {
      if (a.status === "working" || a.status === "thinking") acc.working++
      else if (a.status === "waiting") acc.waiting++
      else if (a.status === "error") acc.error++
      else acc.idle++
      return acc
    },
    { working: 0, waiting: 0, error: 0, idle: 0 }
  )

  return (
    <div className="h-9 bg-surface border-t border-edge flex items-center px-5 gap-6">
      <StatusDot count={counts.working} label="active" color="var(--color-sage)" />
      <StatusDot count={counts.waiting} label="pending" color="var(--color-ember)" />
      <StatusDot count={counts.error} label="errors" color="var(--color-coral)" />
      <StatusDot count={counts.idle} label="idle" color="var(--color-mute)" />
    </div>
  )
}
