import { EventEmitter } from "node:events"
import type { AgentEvent, AgentStatus, MeetingMessage } from "@ozap-office/shared"

type EventMap = {
  agentEvent: [AgentEvent]
  agentStatus: [{ agentId: string; status: AgentStatus }]
  meetingMessage: [MeetingMessage]
}

const emitter = new EventEmitter()

export const eventBus = {
  emit: <K extends keyof EventMap>(event: K, ...args: EventMap[K]) =>
    emitter.emit(event, ...args),
  on: <K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void) => {
    emitter.on(event, listener)
    return () => emitter.off(event, listener)
  },
}
