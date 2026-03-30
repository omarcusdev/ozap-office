import type { ToolDefinition } from "@ozap-office/shared"
import { executeLeaderTool } from "../tools/leader.js"
import { executeFinanceTool } from "../tools/finance.js"
import { executeMemoryTool } from "../tools/memory.js"
import { executeAdsTool } from "../tools/ads.js"
import { executeAnalyticsTool } from "../tools/analytics.js"

type ToolResult = {
  content: string
  isError?: boolean
}

const LEADER_TOOLS = ["askAgent", "getAgentHistory", "delegateTask"]
const FINANCE_TOOLS = ["getOrders", "getProducts", "getRevenueSummary"]
const MEMORY_TOOLS = ["updateCoreMemory", "deleteCoreMemory", "saveToArchive", "searchArchive"]
const ADS_TOOLS = [
  "getAdAccountOverview",
  "listCampaigns",
  "getCampaignInsights",
  "searchTargetingOptions",
  "createCampaign",
  "createAdSet",
  "createAd",
  "activateCampaign",
  "pauseCampaign",
  "updateBudget",
  "duplicateCampaign",
  "comparePerformance",
]
const ANALYTICS_TOOLS = [
  "getUsageSummary",
  "getTopUsers",
  "getUserUsageDetail",
  "getDailyUsageTrend",
  "getModelUsageBreakdown",
  "getSystemKeyUsers",
  "getTwinInteractionStats",
  "getInstanceUsageBreakdown",
]

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

    if (MEMORY_TOOLS.includes(toolName)) {
      return executeMemoryTool(agentId, toolName, toolInput)
    }

    if (ADS_TOOLS.includes(toolName)) {
      return executeAdsTool(toolName, toolInput)
    }

    if (ANALYTICS_TOOLS.includes(toolName)) {
      return executeAnalyticsTool(toolName, toolInput)
    }

    return { content: `Unknown tool: ${toolName}`, isError: true }
  } catch (error) {
    return {
      content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }
}
