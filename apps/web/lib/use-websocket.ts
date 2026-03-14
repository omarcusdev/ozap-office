"use client"

import { useEffect, useRef, useCallback } from "react"
import { createWsClient } from "./ws-client"
import type { WsServerMessage } from "@ozap-office/shared"

export const useWebSocket = (onMessage: (message: WsServerMessage) => void) => {
  const clientRef = useRef<ReturnType<typeof createWsClient> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const client = createWsClient((msg) => onMessageRef.current(msg))
    clientRef.current = client
    return () => client.disconnect()
  }, [])

  const subscribe = useCallback((agentId: string) => {
    clientRef.current?.send({ type: "subscribe", payload: { agentId } })
  }, [])

  const unsubscribe = useCallback((agentId: string) => {
    clientRef.current?.send({ type: "unsubscribe", payload: { agentId } })
  }, [])

  return { subscribe, unsubscribe }
}
