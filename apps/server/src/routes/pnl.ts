import type { FastifyInstance } from "fastify"
import { aggregateMonth } from "../pnl/aggregator.js"

const currentMonth = (): string => {
  const now = new Date()
  const tzOffset = -3 * 60
  const local = new Date(now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60_000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`
}

export const registerPnlRoutes = (server: FastifyInstance) => {
  server.get<{ Querystring: { month?: string } }>("/api/pnl", async (request, reply) => {
    const month = request.query.month ?? currentMonth()
    try {
      const summary = await aggregateMonth(month)
      return summary
    } catch (error) {
      reply.code(400)
      return { error: error instanceof Error ? error.message : "Invalid month" }
    }
  })
}
