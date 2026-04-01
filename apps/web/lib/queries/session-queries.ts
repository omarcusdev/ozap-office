import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useEffect } from "react"

export const useSessionsQuery = (agentId: string | null) => {
  const setSessions = useConversationStore((s) => s.setSessions)

  const query = useQuery({
    queryKey: ["sessions", agentId],
    queryFn: () => api.getSessions(agentId!),
    enabled: !!agentId,
  })

  useEffect(() => {
    if (query.data) {
      setSessions(query.data)
    }
  }, [query.data, setSessions])

  return query
}

export const useCreateSessionMutation = (agentId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.createSession(agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}

export const useDeleteSessionMutation = (agentId: string | null) => {
  const queryClient = useQueryClient()
  const removeSession = useConversationStore((s) => s.removeSession)

  return useMutation({
    mutationFn: (sessionId: string) => api.deleteSession(agentId!, sessionId),
    onSuccess: (_, sessionId) => {
      removeSession(sessionId)
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}
