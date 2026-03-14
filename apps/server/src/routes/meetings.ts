import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { meetings, meetingMessages } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { handleMeetingMessage } from "../runtime/executor.js"

export const registerMeetingRoutes = (server: FastifyInstance) => {
  server.post<{ Body: { topic?: string } }>("/api/meetings", async (request) => {
    const [meeting] = await db
      .insert(meetings)
      .values({
        topic: request.body.topic ?? null,
        status: "active",
        startedAt: new Date(),
      })
      .returning()

    return meeting
  })

  server.get<{ Params: { id: string } }>("/api/meetings/:id/messages", async (request) => {
    return db
      .select()
      .from(meetingMessages)
      .where(eq(meetingMessages.meetingId, request.params.id))
      .orderBy(meetingMessages.timestamp)
  })

  server.post<{
    Params: { id: string }
    Body: { content: string }
  }>("/api/meetings/:id/messages", async (request) => {
    const { id } = request.params
    const { content } = request.body

    const [userMessage] = await db
      .insert(meetingMessages)
      .values({
        meetingId: id,
        sender: "user",
        content,
        timestamp: new Date(),
      })
      .returning()

    const leaderResponse = await handleMeetingMessage(id, content)

    return { userMessage, leaderResponse }
  })
}
