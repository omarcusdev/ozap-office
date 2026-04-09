"use client"

import { Plus, X } from "lucide-react"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useCreateSessionMutation, useDeleteSessionMutation } from "@/lib/queries/session-queries"

type SessionTabBarProps = {
  agentId: string
}

export const SessionTabBar = ({ agentId }: SessionTabBarProps) => {
  const sessions = useConversationStore((s) => s.sessions)
  const activeSessionId = useConversationStore((s) => s.activeSessionId)
  const setActiveSessionId = useConversationStore((s) => s.setActiveSessionId)
  const createSession = useCreateSessionMutation(agentId)
  const deleteSession = useDeleteSessionMutation(agentId)

  const handleNewSession = () => {
    if (createSession.isPending) return
    createSession.mutate(undefined, {
      onSuccess: (session) => {
        setActiveSessionId(session.id)
      },
    })
  }

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    deleteSession.mutate(sessionId)
  }

  return (
    <div className="flex items-center border-b border-edge bg-[#1e1c19] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        onClick={handleNewSession}
        disabled={createSession.isPending}
        className="shrink-0 px-3 py-2 border-r border-edge text-gold hover:text-gold-light disabled:text-mute transition-colors"
        title="New conversation"
      >
        <Plus className="w-4 h-4" />
      </button>
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId
        return (
          <button
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            className={`group shrink-0 flex items-center gap-1.5 px-3.5 py-2 font-mono text-[11px] transition-colors ${
              isActive
                ? "text-gold border-b-2 border-gold bg-surface"
                : "text-sand hover:text-cream"
            }`}
          >
            <span className="truncate max-w-[120px]">
              {session.title ?? "Untitled"}
            </span>
            {!isActive && (
              <span
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 text-mute hover:text-coral transition-all"
              >
                <X className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
