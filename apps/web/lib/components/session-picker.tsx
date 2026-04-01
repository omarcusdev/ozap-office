"use client"

import { MessageSquarePlus, Trash2, ChevronDown } from "lucide-react"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useCreateSessionMutation, useDeleteSessionMutation } from "@/lib/queries/session-queries"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/lib/components/ui/dropdown-menu"

const formatRelativeDate = (date: Date) => {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type SessionPickerProps = {
  agentId: string
}

export const SessionPicker = ({ agentId }: SessionPickerProps) => {
  const sessions = useConversationStore((s) => s.sessions)
  const activeSessionId = useConversationStore((s) => s.activeSessionId)
  const setActiveSessionId = useConversationStore((s) => s.setActiveSessionId)
  const createSession = useCreateSessionMutation(agentId)
  const deleteSession = useDeleteSessionMutation(agentId)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const handleNewSession = () => {
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
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-sand hover:text-cream transition-colors rounded-sm hover:bg-raised">
          <span className="truncate max-w-[180px]">
            {activeSession?.title ?? "Current conversation"}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px] max-h-[300px] overflow-y-auto">
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className="flex items-center justify-between group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] truncate">
                  {session.title ?? "Untitled conversation"}
                </div>
                <div className="text-[10px] text-mute">
                  {formatRelativeDate(session.createdAt)}
                </div>
              </div>
              {session.id === activeSessionId && (
                <div className="w-1.5 h-1.5 rounded-full bg-gold shrink-0 ml-2" />
              )}
              <button
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 ml-2 p-0.5 text-mute hover:text-coral transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </DropdownMenuItem>
          ))}
          {sessions.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={handleNewSession}>
            <MessageSquarePlus className="w-3.5 h-3.5 mr-2" />
            <span className="text-[12px]">New conversation</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
