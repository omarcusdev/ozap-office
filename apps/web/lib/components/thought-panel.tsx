"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useEventStore } from "@/lib/stores/event-store"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useAgentsQuery } from "@/lib/queries/agent-queries"
import { useConversationQuery, useClearConversationMutation, useSendMessageMutation } from "@/lib/queries/conversation-queries"
import { useSessionsQuery } from "@/lib/queries/session-queries"
import { MarkdownRenderer } from "./markdown-renderer"
import { SessionPicker } from "./session-picker"
import { DelegationThread, groupDelegationEvents } from "./delegation-thread"
import { api } from "@/lib/api-client"
import type { AgentEvent } from "@ozap-office/shared"

const STATUS_COLORS: Record<string, string> = {
  idle: "#5a5650",
  working: "#7ab87a",
  thinking: "#c89b3c",
  waiting: "#d4854a",
  meeting: "#9b7ed8",
  error: "#c75450",
  has_report: "#d4854a",
}

const EVENT_COLORS: Record<string, string> = {
  thinking: "#c89b3c",
  tool_call: "#7ab87a",
  tool_result: "#7ab87a",
}

const formatTime = (timestamp: Date) =>
  new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

const formatDuration = (events: AgentEvent[]) => {
  if (events.length < 2) return ""
  const first = new Date(events[0].timestamp).getTime()
  const last = new Date(events[events.length - 1].timestamp).getTime()
  const seconds = Math.round((last - first) / 1000)
  return `${seconds}s`
}

const UserBubble = ({ message }: { message: string }) => (
  <div className="flex justify-end px-4 py-2">
    <div className="max-w-[85%] bg-gold/15 border border-gold/20 rounded-lg rounded-br-sm px-3.5 py-2.5">
      <p className="text-sm text-cream leading-relaxed">{message}</p>
    </div>
  </div>
)

const AgentBubble = ({ content }: { content: string }) => (
  <div className="flex justify-start px-4 py-2">
    <div className="max-w-[90%] bg-raised border border-edge-light rounded-lg rounded-bl-sm px-3.5 py-2.5">
      <MarkdownRenderer content={content} />
    </div>
  </div>
)

const EventItem = ({ event }: { event: AgentEvent }) => {
  const color = EVENT_COLORS[event.type] ?? "#5a5650"
  return (
    <div className="py-2 px-3" style={{ borderLeft: `2px solid ${color}` }}>
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className="text-sand">{formatTime(event.timestamp)}</span>
        <span style={{ color }}>{event.type}</span>
      </div>
      <div className="text-[12px] text-cream/70 mt-1 leading-relaxed line-clamp-3">
        {event.content.slice(0, 200)}
        {event.content.length > 200 && "..."}
      </div>
    </div>
  )
}

const InternalDetails = ({ events }: { events: AgentEvent[] }) => {
  const [expanded, setExpanded] = useState(false)
  const duration = formatDuration(events)

  return (
    <div className="px-4 py-1">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="text-[11px] font-mono text-mute hover:text-sand transition-colors"
      >
        {expanded ? "\u25BE" : "\u25B8"} {events.length} event{events.length !== 1 ? "s" : ""}
        {duration && ` \u00B7 ${duration}`}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-2 space-y-0.5">
          {events.map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

const TypingIndicator = () => (
  <div className="flex items-center gap-1.5 px-4 py-3 ml-4">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-sand"
        style={{ animation: `typing 1.4s ${i * 0.2}s ease-in-out infinite` }}
      />
    ))}
  </div>
)

const NewActivityPill = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-gold/90 text-canvas text-xs font-medium rounded-full shadow-lg hover:bg-gold transition-colors z-10"
  >
    &darr; New activity
  </button>
)

export const ThoughtPanel = () => {
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId)
  const selectAgent = useAgentStore((s) => s.selectAgent)
  const agents = useAgentStore((s) => s.agents)
  const events = useEventStore((s) => s.events)
  const conversation = useConversationStore((s) => s.messages)
  const activeSessionId = useConversationStore((s) => s.activeSessionId)

  useAgentsQuery()
  useConversationQuery(selectedAgentId, activeSessionId)
  useSessionsQuery(selectedAgentId)

  const clearConversationMutation = useClearConversationMutation(selectedAgentId)
  const sendMessageMutation = useSendMessageMutation()

  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [showNewActivity, setShowNewActivity] = useState(false)
  const [displayedAgentId, setDisplayedAgentId] = useState<string | null>(null)
  const previousContentLengthRef = useRef(0)

  const isOpen = !!selectedAgentId

  useEffect(() => {
    if (selectedAgentId) {
      setDisplayedAgentId(selectedAgentId)
      setPendingMessage(null)
    } else {
      const timer = setTimeout(() => setDisplayedAgentId(null), 300)
      return () => clearTimeout(timer)
    }
  }, [selectedAgentId])

  const selectedAgent = agents.find((a) => a.id === (selectedAgentId ?? displayedAgentId))

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 100
    if (isNearBottomRef.current) setShowNewActivity(false)
  }, [])

  const contentLength = conversation.length + events.length + (pendingMessage ? 1 : 0)

  useEffect(() => {
    if (contentLength > previousContentLengthRef.current) {
      if (isNearBottomRef.current && scrollRef.current) {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        })
      } else if (previousContentLengthRef.current > 0) {
        setShowNewActivity(true)
      }
    }
    previousContentLengthRef.current = contentLength
  }, [contentLength])

  useEffect(() => {
    if (pendingMessage && events.some((e) => e.type === "user_message")) {
      setPendingMessage(null)
    }
  }, [events, pendingMessage])

  useEffect(() => {
    if (selectedAgent?.status === "has_report" && selectedAgentId) {
      api.markAgentRead(selectedAgentId).catch(console.error)
    }
  }, [selectedAgentId, selectedAgent?.status])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    setShowNewActivity(false)
  }, [])

  const handleSend = async () => {
    const trimmed = message.trim()
    if (!trimmed || !selectedAgentId || sending) return

    setPendingMessage(trimmed)
    setMessage("")
    setSending(true)

    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })

    try {
      await sendMessageMutation.mutateAsync({ agentId: selectedAgentId, message: trimmed })
    } catch (err) {
      console.error("Failed to send:", err)
      setPendingMessage(null)
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const { delegations, otherEvents: nonDelegationEvents } = groupDelegationEvents(events)
  const internalEvents = nonDelegationEvents.filter(
    (e) => e.type === "thinking" || e.type === "tool_call" || e.type === "tool_result"
  )
  const responseEvents = nonDelegationEvents.filter((e) => e.type === "message")
  const currentResponse = responseEvents.length > 0
    ? responseEvents.map((e) => e.content).join("\n\n")
    : null
  const userMessageEvent = events.find((e) => e.type === "user_message")
  const currentUserMessage = pendingMessage ?? userMessageEvent?.content ?? null
  const isProcessing = events.length > 0 && !events.some((e) => e.type === "completed" || e.type === "error")
  const hasContent = conversation.length > 0 || events.length > 0 || pendingMessage

  const statusColor = selectedAgent ? STATUS_COLORS[selectedAgent.status] ?? "#5a5650" : "#5a5650"

  return (
    <div className={`overflow-hidden transition-[width] duration-300 ease-out ${isOpen ? "w-[400px]" : "w-0"}`}>
      <div className={`w-[400px] min-w-[400px] bg-surface border-l border-edge flex flex-col h-full transition-all duration-300 ease-out ${isOpen ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}>
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
                    <h3 className="font-semibold text-[15px] text-cream leading-tight">{selectedAgent.name}</h3>
                    <p className="text-xs text-sand mt-0.5">{selectedAgent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {conversation.length > 0 && (
                    <button
                      onClick={() => clearConversationMutation.mutate()}
                      className="text-mute hover:text-sand transition-colors p-1"
                      title="Clear conversation"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 4h9M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M8.5 6.5v4M5.5 6.5v4M3.5 4l.5 7a1 1 0 001 1h4a1 1 0 001-1l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => selectAgent(null)}
                    className="text-mute hover:text-sand transition-colors p-1 -mr-1 -mt-0.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                <span className="text-[11px] font-mono text-sand tracking-wide">{selectedAgent.status}</span>
              </div>
              <div className="mt-3">
                <SessionPicker agentId={selectedAgentId!} />
              </div>
            </div>

            <div ref={scrollRef} onScroll={checkNearBottom} className="flex-1 overflow-y-auto relative">
              {!hasContent ? (
                <div className="flex flex-col items-center justify-center h-full px-6">
                  <p className="text-sm text-mute">No activity yet</p>
                  <p className="text-xs text-mute/60 mt-1">Send a message to start</p>
                </div>
              ) : (
                <div className="py-3 space-y-1">
                  {conversation.map((msg) =>
                    msg.role === "user" ? (
                      <UserBubble key={msg.id} message={msg.content} />
                    ) : (
                      <AgentBubble key={msg.id} content={msg.content} />
                    )
                  )}

                  {currentUserMessage && <UserBubble message={currentUserMessage} />}
                  {internalEvents.length > 0 && <InternalDetails events={internalEvents} />}
                  {delegations.map((pair) => (
                    <DelegationThread key={pair.start.id} pair={pair} />
                  ))}
                  {currentResponse && <AgentBubble content={currentResponse} />}
                  {isProcessing && <TypingIndicator />}
                </div>
              )}
              {showNewActivity && <NewActivityPill onClick={scrollToBottom} />}
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
