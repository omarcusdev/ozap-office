import type { FastifyRequest, FastifyReply } from "fastify"
import { config } from "../config.js"

export const validateApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.url.startsWith("/ws") || request.url.startsWith("/api/track")) return
  const apiKey = request.headers["x-api-key"]
  if (apiKey !== config.apiKey) {
    reply.code(401).send({ error: "Invalid API key" })
  }
}
