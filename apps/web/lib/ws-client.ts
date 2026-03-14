import type { WsServerMessage, WsClientMessage } from "@ozap-office/shared"

type MessageHandler = (message: WsServerMessage) => void

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001"
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ""

export const createWsClient = (onMessage: MessageHandler) => {
  const state = { ws: null as WebSocket | null, reconnectTimeout: null as ReturnType<typeof setTimeout> | null }

  const connect = () => {
    state.ws = new WebSocket(`${WS_URL}/ws?key=${API_KEY}`)

    state.ws.onopen = () => console.log("WebSocket connected")

    state.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsServerMessage
        onMessage(message)
      } catch {}
    }

    state.ws.onclose = () => {
      console.log("WebSocket disconnected, reconnecting in 3s...")
      state.reconnectTimeout = setTimeout(connect, 3000)
    }

    state.ws.onerror = (error) => {
      console.error("WebSocket error:", error)
      state.ws?.close()
    }
  }

  const send = (message: WsClientMessage) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(message))
    }
  }

  const disconnect = () => {
    if (state.reconnectTimeout) clearTimeout(state.reconnectTimeout)
    state.ws?.close()
  }

  connect()

  return { send, disconnect }
}
