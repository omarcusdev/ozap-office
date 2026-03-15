import type { ToolDefinition } from "@ozap-office/shared"
import { executeLeaderTool } from "../tools/leader.js"
import { executeFinanceTool } from "../tools/finance.js"

type ToolResult = {
  content: string
  isError?: boolean
}

const LEADER_TOOLS = ["askAgent", "getAgentHistory", "delegateTask"]
const FINANCE_TOOLS = ["getOrders", "getProducts", "getRevenueSummary"]

export const executeTool = async (
  agentId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  availableTools: ToolDefinition[]
): Promise<ToolResult> => {
  try {
    if (LEADER_TOOLS.includes(toolName)) {
      return executeLeaderTool(toolName, toolInput)
    }

    if (FINANCE_TOOLS.includes(toolName)) {
      return executeFinanceTool(toolName, toolInput)
    }

    return { content: `Unknown tool: ${toolName}`, isError: true }
  } catch (error) {
    return {
      content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }
}
