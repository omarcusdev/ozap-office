"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { MarkdownRenderer } from "./markdown-renderer"
import { Badge } from "@/lib/components/ui/badge"
import { useAgentStore } from "@/lib/stores/agent-store"
import type { AgentEvent } from "@ozap-office/shared"

type DelegationPair = {
  start: AgentEvent
  response: AgentEvent | null
}

export const groupDelegationEvents = (events: AgentEvent[]): {
  delegations: DelegationPair[]
  otherEvents: AgentEvent[]
} => {
  const delegations: DelegationPair[] = []
  const otherEvents: AgentEvent[] = []
  const startEvents = new Map<string, AgentEvent>()

  for (const event of events) {
    if (event.type === "delegation_start") {
      const delegationId = (event.metadata as any).delegationId as string
      startEvents.set(delegationId, event)
    } else if (event.type === "delegation_response") {
      const delegationId = (event.metadata as any).delegationId as string
      const start = startEvents.get(delegationId)
      if (start) {
        delegations.push({ start, response: event })
        startEvents.delete(delegationId)
      }
    } else {
      otherEvents.push(event)
    }
  }

  for (const start of startEvents.values()) {
    delegations.push({ start, response: null })
  }

  return { delegations, otherEvents }
}

type DelegationThreadProps = {
  pair: DelegationPair
}

export const DelegationThread = ({ pair }: DelegationThreadProps) => {
  const [expanded, setExpanded] = useState(false)
  const agents = useAgentStore((s) => s.agents)

  const metadata = pair.start.metadata as {
    targetAgentId: string
    targetAgentName: string
    question?: string
    task?: string
  }

  const agent = agents.find((a) => a.id === metadata.targetAgentId)
  const agentColor = agent?.color ?? "#8a8478"
  const isPending = !pair.response

  return (
    <div className="px-4 py-1">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2 text-[11px] font-mono text-sand hover:text-cream transition-colors w-full text-left"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: agentColor }} />
        <span>Asked {metadata.targetAgentName}</span>
        {isPending && <Badge variant="ember" className="ml-auto">waiting...</Badge>}
      </button>

      {expanded && (
        <div className="ml-5 mt-2 pl-3 space-y-2" style={{ borderLeft: `2px solid ${agentColor}` }}>
          <div className="text-[11px] text-mute">
            <span className="font-mono">&rarr;</span>{" "}
            <span className="text-cream/70">{metadata.question ?? metadata.task}</span>
          </div>
          {pair.response && (
            <div className="bg-raised/50 border border-edge-light rounded-sm p-2.5">
              <div className="text-[11px] font-mono text-sand mb-1">
                &larr; {metadata.targetAgentName} responded
              </div>
              <MarkdownRenderer content={pair.response.content} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
