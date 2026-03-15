"use client"

import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { useOffice } from "@/app/providers"
import { api } from "@/lib/api-client"
import type { AgentEvent } from "@ozap-office/shared"

const EVENT_COLORS: Record<string, string> = {
  thinking: "#c89b3c",
  tool_call: "#7ab87a",
  tool_result: "#7ab87a",
  message: "#e5dfd3",
  approval_needed: "#d4854a",
  completed: "#7ab87a",
  error: "#c75450",
}

const STATUS_COLORS: Record<string, string> = {
  idle: "#5a5650",
  working: "#7ab87a",
  thinking: "#c89b3c",
  waiting: "#d4854a",
  meeting: "#9b7ed8",
  error: "#c75450",
  has_report: "#d4854a",
}

const formatTime = (timestamp: Date) =>
  new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

const EventItem = ({ event }: { event: AgentEvent }) => {
  const color = EVENT_COLORS[event.type] ?? "#5a5650"

  return (
    <div className="py-3 px-4 ml-4" style={{ borderLeft: `2px solid ${color}` }}>
      <div className="flex items-center gap-2.5 font-mono text-[11px]">
        <span className="text-sand">{formatTime(event.timestamp)}</span>
        <span style={{ color }}>{event.type}</span>
      </div>
      <div className="text-[13px] text-cream/80 mt-1.5 leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-hr:my-2 prose-strong:text-cream prose-headings:text-cream">
        <Markdown>{event.content}</Markdown>
      </div>
    </div>
  )
}

export const ThoughtPanel = () => {
  const { selectedAgentId, agents, events, selectAgent } = useOffice()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [displayedAgentId, setDisplayedAgentId] = useState<string | null>(null)

  const isOpen = !!selectedAgentId

  useEffect(() => {
    if (selectedAgentId) {
      setDisplayedAgentId(selectedAgentId)
    } else {
      const timer = setTimeout(() => setDisplayedAgentId(null), 300)
      return () => clearTimeout(timer)
    }
  }, [selectedAgentId])

  const selectedAgent = agents.find((a) => a.id === (selectedAgentId ?? displayedAgentId))

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  useEffect(() => {
    if (selectedAgent?.status === "has_report" && selectedAgentId) {
      api.markAgentRead(selectedAgentId).catch(console.error)
    }
  }, [selectedAgentId, selectedAgent?.status])

  const handleSend = async () => {
    if (!message.trim() || !selectedAgentId || sending) return
    setSending(true)
    try {
      await api.triggerAgent(selectedAgentId, message.trim())
      setMessage("")
    } catch (err) {
      console.error("Failed to send:", err)
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const statusColor = selectedAgent ? STATUS_COLORS[selectedAgent.status] ?? "#5a5650" : "#5a5650"

  return (
    <div
      className={`overflow-hidden transition-[width] duration-300 ease-out ${
        isOpen ? "w-[400px]" : "w-0"
      }`}
    >
      <div
        className={`w-[400px] min-w-[400px] bg-surface border-l border-edge flex flex-col h-full transition-all duration-300 ease-out ${
          isOpen ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
        }`}
      >
        {selectedAgent && (
          <>
            <div className="p-5 border-b border-edge">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-10 h-10 rounded-sm flex items-center justify-center text-base font-bold text-canvas"
                    style={{ backgroundColor: selectedAgent.color }}
                  >
                    {selectedAgent.name[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[15px] text-cream leading-tight">
                      {selectedAgent.name}
                    </h3>
                    <p className="text-xs text-sand mt-0.5">{selectedAgent.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => selectAgent(null)}
                  className="text-mute hover:text-sand transition-colors p-1 -mr-1 -mt-0.5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <span className="text-[11px] font-mono text-sand tracking-wide">
                  {selectedAgent.status}
                </span>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-6">
                  <p className="text-sm text-mute">No activity yet</p>
                  <p className="text-xs text-mute/60 mt-1">Send a message to start</p>
                </div>
              ) : (
                <div className="py-2">
                  {events.map((event) => (
                    <EventItem key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-edge">
              <div className="flex items-center gap-2 bg-raised border border-edge-light rounded-sm overflow-hidden transition-colors focus-within:border-gold/30">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${selectedAgent.name}...`}
                  disabled={sending}
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-cream placeholder-mute focus:outline-none disabled:opacity-40"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="px-3.5 py-2.5 text-gold hover:text-gold-light disabled:text-mute disabled:cursor-not-allowed transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
