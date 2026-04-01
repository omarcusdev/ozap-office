"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "./api-client"
import type { ConversationMessage } from "@ozap-office/shared"

export const useConversation = (agentId: string | null) => {
  const [conversation, setConversation] = useState<ConversationMessage[]>([])

  const refreshConversation = useCallback((): Promise<void> => {
    if (!agentId) {
      setConversation([])
      return Promise.resolve()
    }
    return api
      .getConversation(agentId)
      .then(setConversation)
      .catch(() => setConversation([]))
  }, [agentId])

  useEffect(() => {
    refreshConversation()
  }, [refreshConversation])

  const clearConversation = useCallback(async () => {
    if (!agentId) return
    await api.clearConversation(agentId)
    setConversation([])
  }, [agentId])

  return { conversation, refreshConversation, clearConversation }
}
