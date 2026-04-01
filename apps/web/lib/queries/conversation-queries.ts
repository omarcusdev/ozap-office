import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useEffect } from "react"

export const useConversationQuery = (agentId: string | null, sessionId: string | null) => {
  const setMessages = useConversationStore((s) => s.setMessages)

  const query = useQuery({
    queryKey: ["conversation", agentId, sessionId],
    queryFn: () => {
      if (sessionId) {
        return api.getSessionMessages(agentId!, sessionId)
      }
      return api.getConversation(agentId!)
    },
    enabled: !!agentId,
  })

  useEffect(() => {
    if (query.data) {
      setMessages(query.data)
    }
  }, [query.data, setMessages])

  return query
}

export const useClearConversationMutation = (agentId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.clearConversation(agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", agentId] })
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}

export const useSendMessageMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ agentId, message }: { agentId: string; message: string }) =>
      api.triggerAgent(agentId, message),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ["conversation", agentId] })
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}
