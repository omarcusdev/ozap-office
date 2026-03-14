import type { FastifyInstance } from "fastify"
import type { WebSocket } from "ws"
import { config } from "../config.js"
import { eventBus } from "./event-bus.js"
import type { WsClientMessage, WsServerMessage } from "@ozap-office/shared"

type ClientState = {
  ws: WebSocket
  subscriptions: Set<string>
  receiveAll: boolean
}

const clients = new Set<ClientState>()

const broadcast = (message: WsServerMessage, agentId?: string) => {
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.ws.readyState !== 1) continue
    if (agentId && !client.receiveAll && !client.subscriptions.has(agentId)) continue
    client.ws.send(data)
  }
}

export const registerWebSocket = (server: FastifyInstance) => {
  eventBus.on("agentEvent", (event) => {
    broadcast({ type: "agent_event", payload: event }, event.agentId)
  })

  eventBus.on("agentStatus", (status) => {
    broadcast({ type: "agent_status", payload: status }, status.agentId)
  })

  eventBus.on("meetingMessage", (message) => {
    broadcast({ type: "meeting_message", payload: message })
  })

  server.get("/ws", { websocket: true }, (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const key = url.searchParams.get("key")

    if (key !== config.apiKey) {
      socket.close(4001, "Invalid API key")
      return
    }

    const clientState: ClientState = {
      ws: socket,
      subscriptions: new Set(),
      receiveAll: true,
    }

    clients.add(clientState)

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as WsClientMessage
        if (message.type === "subscribe") {
          clientState.subscriptions.add(message.payload.agentId)
          clientState.receiveAll = false
        } else if (message.type === "unsubscribe") {
          clientState.subscriptions.delete(message.payload.agentId)
          if (clientState.subscriptions.size === 0) clientState.receiveAll = true
        }
      } catch {
      }
    })

    socket.on("close", () => {
      clients.delete(clientState)
    })
  })
}
