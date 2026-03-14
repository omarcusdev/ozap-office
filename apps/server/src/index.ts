import Fastify from "fastify"
import cors from "@fastify/cors"
import websocket from "@fastify/websocket"
import { config } from "./config.js"
import { validateApiKey } from "./middleware/api-key.js"
import { registerAgentRoutes } from "./routes/agents.js"
import { registerTaskRunRoutes } from "./routes/task-runs.js"
import { registerApprovalRoutes } from "./routes/approvals.js"
import { registerMeetingRoutes } from "./routes/meetings.js"
import { registerWebSocket } from "./events/websocket.js"
import { startScheduler } from "./scheduler/index.js"
import { recoverOrphanedTaskRuns } from "./startup.js"

const buildServer = async () => {
  const server = Fastify({ logger: true })

  await server.register(cors, { origin: config.corsOrigin })
  await server.register(websocket)

  server.addHook("preHandler", validateApiKey)

  registerAgentRoutes(server)
  registerTaskRunRoutes(server)
  registerApprovalRoutes(server)
  registerMeetingRoutes(server)
  registerWebSocket(server)

  return server
}

const start = async () => {
  const server = await buildServer()

  await recoverOrphanedTaskRuns()
  startScheduler()

  await server.listen({ port: config.port, host: "0.0.0.0" })
  console.log(`Server running on port ${config.port}`)
}

start().catch((err) => {
  console.error("Failed to start server:", err)
  process.exit(1)
})
