"use client"

import { useEffect, useRef, useState } from "react"
import { useOffice } from "@/app/providers"
import { api } from "@/lib/api-client"
import type { AgentEvent } from "@ozap-office/shared"

const EVENT_STYLES: Record<string, { icon: string; color: string }> = {
  thinking: { icon: "~", color: "#f1fa8c" },
  tool_call: { icon: ">", color: "#8be9fd" },
  tool_result: { icon: "<", color: "#50fa7b" },
  message: { icon: "*", color: "#ffffff" },
  approval_needed: { icon: "!", color: "#ffb86c" },
  completed: { icon: "+", color: "#50fa7b" },
  error: { icon: "x", color: "#ff5555" },
}

const EventItem = ({ event }: { event: AgentEvent }) => {
  const style = EVENT_STYLES[event.type] ?? { icon: "-", color: "#888888" }
  const time = new Date(event.timestamp).toLocaleTimeString()

  return (
    <div className="border-b border-white/5 py-2 px-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono" style={{ color: style.color }}>[{style.icon}]</span>
        <span className="font-mono text-gray-500">{time}</span>
        <span className="text-gray-600">{event.type}</span>
      </div>
      <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap leading-relaxed">{event.content}</p>
    </div>
  )
}

export const ThoughtPanel = () => {
  const { selectedAgentId, agents, events } = useOffice()
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

  return (
    <div
      className={`overflow-hidden transition-[width] duration-300 ease-out ${
        isOpen ? "w-96" : "w-0"
      }`}
    >
      <div
        className={`w-96 min-w-[24rem] bg-gray-900 border-l border-white/10 flex flex-col h-full transition-all duration-300 ease-out ${
          isOpen ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
        }`}
      >
        {selectedAgent && (
          <>
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: selectedAgent.color }}
                >
                  {selectedAgent.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{selectedAgent.name}</h3>
                  <p className="text-xs text-gray-400">{selectedAgent.role}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: selectedAgent.status === "idle" ? "#666" : "#50fa7b" }}
                />
                <span className="text-xs text-gray-400">{selectedAgent.status}</span>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 p-4">
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Send a message to start</p>
                </div>
              ) : (
                events.map((event) => <EventItem key={event.id} event={event} />)
              )}
            </div>

            <div className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${selectedAgent.name}...`}
                  disabled={sending}
                  className="flex-1 bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/20 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
