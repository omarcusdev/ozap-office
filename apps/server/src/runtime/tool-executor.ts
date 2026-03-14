import type { ToolDefinition } from "@ozap-office/shared"
import { executeLeaderTool } from "../tools/leader.js"

type ToolResult = {
  content: string
  isError?: boolean
}

export const executeTool = async (
  agentId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  availableTools: ToolDefinition[]
): Promise<ToolResult> => {
  try {
    const leaderToolNames = ["askAgent", "getAgentHistory", "delegateTask"]
    if (leaderToolNames.includes(toolName)) {
      return executeLeaderTool(toolName, toolInput)
    }

    return { content: `Unknown tool: ${toolName}`, isError: true }
  } catch (error) {
    return {
      content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }
}
