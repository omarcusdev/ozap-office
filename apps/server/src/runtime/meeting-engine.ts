import { db } from "../db/client.js"
import { agents, meetings, meetingMessages } from "../db/schema.js"
import { eq, ne } from "drizzle-orm"
import { executeAgentForMeeting } from "./executor.js"
import { eventBus } from "../events/event-bus.js"
import type { MeetingMessage } from "@ozap-office/shared"

const MAX_REACTION_ROUNDS = 2

const broadcastMeetingMessage = (message: MeetingMessage) => {
  eventBus.emit("meetingMessage", message)
}

const saveMeetingMessage = async (
  meetingId: string,
  sender: string,
  agentId: string | null,
  content: string,
  round: number,
  phase: string
): Promise<MeetingMessage> => {
  const [msg] = await db
    .insert(meetingMessages)
    .values({
      meetingId,
      sender,
      agentId,
      content,
      round,
      metadata: { phase },
      timestamp: new Date(),
    })
    .returning()

  const meetingMsg: MeetingMessage = {
    id: msg.id,
    meetingId: msg.meetingId,
    sender: msg.sender,
    content: msg.content,
    metadata: { phase, round, agentId },
    timestamp: msg.timestamp,
  }

  broadcastMeetingMessage(meetingMsg)
  return meetingMsg
}

const buildTranscript = (messages: MeetingMessage[], agentNames: Record<string, string>): string =>
  messages
    .map((m) => {
      const name = m.sender === "user" ? "User" : (agentNames[m.sender] ?? m.sender)
      return `${name}: ${m.content}`
    })
    .join("\n\n")

export const processMeetingMessage = async (
  meetingId: string,
  userMessage: string
): Promise<void> => {
  const allAgents = await db.select().from(agents).where(ne(agents.status, "error"))
  const agentNames: Record<string, string> = {}
  for (const agent of allAgents) {
    agentNames[agent.id] = agent.name
  }

  await saveMeetingMessage(meetingId, "user", null, userMessage, 0, "user")

  const conversationMessages = await db
    .select()
    .from(meetingMessages)
    .where(eq(meetingMessages.meetingId, meetingId))
    .orderBy(meetingMessages.timestamp)

  const existingMessages: MeetingMessage[] = conversationMessages.map((m) => ({
    id: m.id,
    meetingId: m.meetingId,
    sender: m.sender,
    content: m.content,
    metadata: (m.metadata as Record<string, unknown>) ?? {},
    timestamp: m.timestamp,
  }))

  const transcript = buildTranscript(existingMessages, agentNames)
  const roundMessages: MeetingMessage[] = []

  const initialPromises = allAgents.map(async (agent) => {
    const prompt = `You are in a team meeting with other agents. Here is the conversation so far:\n\n${transcript}\n\nThe user just said: "${userMessage}"\n\nRespond from your area of expertise (${agent.role}). Be concise and relevant. If you have nothing to add for this topic, say "PASS".`

    const response = await executeAgentForMeeting(agent.id, prompt)

    if (response.trim().toUpperCase() === "PASS") return null

    return saveMeetingMessage(meetingId, agent.id, agent.id, response, 1, "response")
  })

  const initialResults = await Promise.all(initialPromises)
  const initialResponses = initialResults.filter((r): r is MeetingMessage => r !== null)
  roundMessages.push(...initialResponses)

  for (let round = 2; round <= MAX_REACTION_ROUNDS + 1; round++) {
    if (roundMessages.length === 0) break

    const fullTranscript = buildTranscript([...existingMessages, ...roundMessages], agentNames)

    const reactionPromises = allAgents.map(async (agent) => {
      const alreadyResponded = roundMessages.some(
        (m) => m.sender === agent.id && (m.metadata as Record<string, unknown>)?.round === round - 1
      )
      if (!alreadyResponded && round > 2) return null

      const prompt = `Team meeting transcript:\n\n${fullTranscript}\n\nGiven the responses above, do you have something to add, disagree with, or build upon? If not, respond with exactly "PASS". Be concise.`

      const response = await executeAgentForMeeting(agent.id, prompt)

      if (response.trim().toUpperCase() === "PASS") return null

      return saveMeetingMessage(meetingId, agent.id, agent.id, response, round, "reaction")
    })

    const reactionResults = await Promise.all(reactionPromises)
    const reactions = reactionResults.filter((r): r is MeetingMessage => r !== null)

    if (reactions.length === 0) break
    roundMessages.push(...reactions)
  }
}

export const completeMeeting = async (meetingId: string) => {
  await db
    .update(meetings)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(meetings.id, meetingId))
}
