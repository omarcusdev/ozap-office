import { spawn, type ChildProcess } from "node:child_process"
import { createInterface } from "node:readline"
import { config } from "../config.js"

type McpToolResult = {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

type PendingRequest = {
  resolve: (value: McpToolResult) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const MCP_CALL_TIMEOUT_MS = 60_000

const pending = new Map<number, PendingRequest>()
let mcpProcess: ChildProcess | null = null
let requestIdCounter = 0
let initialized: Promise<ChildProcess> | null = null

const spawnAndInitialize = (): Promise<ChildProcess> => {
  if (!config.metaAdsAccessToken) {
    return Promise.reject(new Error("META_ADS_ACCESS_TOKEN must be set"))
  }

  const child = spawn("meta-ads-mcp", [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      META_ACCESS_TOKEN: config.metaAdsAccessToken,
      META_APP_ID: config.metaAdsAppId,
      META_APP_SECRET: config.metaAdsAppSecret,
    },
  })

  const rl = createInterface({ input: child.stdout! })

  rl.on("line", (line) => {
    try {
      const message = JSON.parse(line)
      const id = message.id as number
      const entry = pending.get(id)
      if (!entry) return

      pending.delete(id)
      clearTimeout(entry.timer)

      if (message.error) {
        entry.reject(new Error(message.error.message ?? JSON.stringify(message.error)))
      } else {
        entry.resolve(message.result as McpToolResult)
      }
    } catch {
      // ignore non-JSON lines
    }
  })

  child.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[meta-ads-mcp stderr] ${chunk.toString().trim()}`)
  })

  child.on("exit", (code) => {
    console.error(`[meta-ads-mcp] process exited with code ${code}`)
    mcpProcess = null
    initialized = null
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(`MCP process exited with code ${code}`))
      pending.delete(id)
    }
  })

  mcpProcess = child

  return new Promise<ChildProcess>((resolve, reject) => {
    const initId = ++requestIdCounter
    const timer = setTimeout(() => {
      pending.delete(initId)
      reject(new Error("MCP initialization timed out"))
    }, 10_000)

    pending.set(initId, {
      resolve: () => {
        clearTimeout(timer)
        child.stdin!.write(
          JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        )
        resolve(child)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      },
      timer,
    })

    child.stdin!.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: initId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "ozap-office", version: "1.0.0" },
        },
      }) + "\n"
    )
  })
}

const ensureProcess = (): Promise<ChildProcess> => {
  if (mcpProcess && mcpProcess.exitCode === null && initialized) {
    return initialized
  }

  initialized = spawnAndInitialize()
  return initialized
}

export const callMcpTool = async (toolName: string, args: Record<string, unknown>): Promise<McpToolResult> => {
  const child = await ensureProcess()
  const id = ++requestIdCounter

  const request = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  }

  return new Promise<McpToolResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`MCP call "${toolName}" timed out after ${MCP_CALL_TIMEOUT_MS}ms`))
    }, MCP_CALL_TIMEOUT_MS)

    pending.set(id, { resolve, reject, timer })

    child.stdin!.write(JSON.stringify(request) + "\n", (err) => {
      if (err) {
        pending.delete(id)
        clearTimeout(timer)
        reject(new Error(`Failed to write to MCP stdin: ${err.message}`))
      }
    })
  })
}

export const shutdownMcp = (): void => {
  if (mcpProcess && mcpProcess.exitCode === null) {
    mcpProcess.kill()
    mcpProcess = null
  }

  for (const [id, entry] of pending) {
    clearTimeout(entry.timer)
    entry.reject(new Error("MCP shutdown"))
    pending.delete(id)
  }
}
