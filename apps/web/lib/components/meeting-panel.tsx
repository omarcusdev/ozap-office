"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send } from "lucide-react"
import { useMeetingStore } from "@/lib/stores/meeting-store"
import { useAgentStore } from "@/lib/stores/agent-store"
import { MarkdownRenderer } from "./markdown-renderer"
import { api } from "@/lib/api-client"

const formatTime = (timestamp: Date) =>
  new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

export const MeetingPanel = () => {
  const meetingId = useMeetingStore((s) => s.meetingId)
  const status = useMeetingStore((s) => s.status)
  const messages = useMeetingStore((s) => s.messages)
  const topic = useMeetingStore((s) => s.topic)
  const agents = useAgentStore((s) => s.agents)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const handleSend = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed || !meetingId || sending) return

    setMessage("")
    setSending(true)

    try {
      await api.sendMeetingMessage(meetingId, trimmed)
    } catch (err) {
      console.error("Failed to send meeting message:", err)
    }
    setSending(false)
  }, [message, meetingId, sending])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (status !== "active") return null

  let lastRound = -1

  return (
    <div className="w-[450px] min-w-[450px] bg-surface border-l border-edge flex flex-col h-full">
      <div className="p-5 border-b border-edge">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-[15px] text-cream leading-tight">Team Meeting</h3>
            {topic && <p className="text-xs text-sand mt-0.5">{topic}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {agents.slice(0, 5).map((agent) => (
                <div
                  key={agent.id}
                  className="w-5 h-5 rounded-full border-2 border-surface flex items-center justify-center text-[8px] font-bold text-canvas"
                  style={{ backgroundColor: agent.color }}
                  title={agent.name}
                >
                  {agent.name[0]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <p className="text-sm text-mute">Meeting started</p>
            <p className="text-xs text-mute/60 mt-1">Send a message to all agents</p>
          </div>
        ) : (
          <div className="py-3 space-y-1">
            {messages.map((msg) => {
              const round = ((msg.metadata as any)?.round as number) ?? 0
              const phase = ((msg.metadata as any)?.phase as string) ?? "user"
              const showRoundSeparator = round > lastRound && round > 0
              lastRound = round

              const isUser = msg.sender === "user"
              const agent = !isUser ? agentMap.get(msg.sender) : null

              return (
                <div key={msg.id}>
                  {showRoundSeparator && (
                    <div className="flex items-center gap-3 px-4 py-2">
                      <div className="flex-1 h-px bg-edge" />
                      <span className="text-[10px] font-mono text-mute uppercase tracking-wider">
                        {phase === "reaction" ? `Discussion (round ${round})` : "Initial Responses"}
                      </span>
                      <div className="flex-1 h-px bg-edge" />
                    </div>
                  )}

                  {isUser ? (
                    <div className="flex justify-end px-4 py-2">
                      <div className="max-w-[85%] bg-gold/15 border border-gold/20 rounded-lg rounded-br-sm px-3.5 py-2.5">
                        <p className="text-sm text-cream leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start px-4 py-2">
                      <div className="max-w-[90%]">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-canvas"
                            style={{ backgroundColor: agent?.color ?? "#8a8478" }}
                          >
                            {agent?.name[0] ?? "?"}
                          </div>
                          <span className="text-[11px] font-medium text-sand">{agent?.name ?? msg.sender}</span>
                          <span className="text-[10px] font-mono text-mute">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className="bg-raised border border-edge-light rounded-lg rounded-tl-sm px-3.5 py-2.5">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
            placeholder="Message all agents..."
            disabled={sending}
            className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-cream placeholder-mute focus:outline-none disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="px-3.5 py-2.5 text-gold hover:text-gold-light disabled:text-mute disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
