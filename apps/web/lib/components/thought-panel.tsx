"use client"

import { useEffect, useRef } from "react"
import { useOffice } from "@/app/providers"
import type { AgentEvent } from "@ozap-office/shared"

const EVENT_ICONS: Record<string, string> = {
  thinking: "~",
  tool_call: ">",
  tool_result: "<",
  message: "*",
  approval_needed: "!",
  completed: "+",
  error: "x",
}

const EventItem = ({ event }: { event: AgentEvent }) => {
  const icon = EVENT_ICONS[event.type] ?? "-"
  const time = new Date(event.timestamp).toLocaleTimeString()

  return (
    <div className="border-b border-white/5 py-2 px-3">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="font-mono">[{icon}]</span>
        <span className="font-mono">{time}</span>
        <span className="text-gray-500">{event.type}</span>
      </div>
      <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap">{event.content}</p>
    </div>
  )
}

export const ThoughtPanel = () => {
  const { selectedAgentId, agents, events } = useOffice()
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  if (!selectedAgent) return null

  return (
    <div className="w-96 bg-gray-900 border-l border-white/10 flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full"
            style={{ backgroundColor: selectedAgent.color }}
          />
          <div>
            <h3 className="font-bold">{selectedAgent.name}</h3>
            <p className="text-xs text-gray-400">{selectedAgent.role}</p>
          </div>
        </div>
        <div className="mt-2 text-xs">
          <span
            className="px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${selectedAgent.color}30`, color: selectedAgent.color }}
          >
            {selectedAgent.status}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-gray-500 text-sm p-4">No events yet</p>
        ) : (
          events.map((event) => <EventItem key={event.id} event={event} />)
        )}
      </div>
    </div>
  )
}
