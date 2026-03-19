import { callMcpTool } from "../integrations/meta-ads-mcp-client.js"
import { classifyOperation, validateBudgetLimit } from "./ads-gateway.js"
import { config } from "../config.js"

type ToolResult = { content: string; isError?: boolean }

type McpToolResult = {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

const extractMcpText = (result: McpToolResult): ToolResult => {
  const text = result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")

  return { content: text, isError: result.isError }
}

const guardedResponse = (reason: string): ToolResult => ({
  content: `⚠️ APPROVAL REQUIRED: This operation requires human approval. Reason: ${reason}. Please inform the user.`,
  isError: true,
})

const getAdAccountOverview = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const dateRange = input.dateRange as string | undefined
  const args: Record<string, unknown> = {
    account_id: config.metaAdsAccountId,
    level: "account",
  }
  if (dateRange) {
    args.date_preset = dateRange
  }

  const result = await callMcpTool("get_insights", args)
  return extractMcpText(result)
}

const listCampaigns = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const status = input.status as string | undefined
  const args: Record<string, unknown> = {
    account_id: config.metaAdsAccountId,
  }
  if (status) {
    args.effective_status = [status]
  }

  const result = await callMcpTool("list_campaigns", args)
  return extractMcpText(result)
}

const getCampaignInsights = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string
  const dateRange = input.dateRange as string | undefined
  const breakdowns = input.breakdowns as string | undefined

  if (!campaignId) {
    return { content: "campaignId is required", isError: true }
  }

  const args: Record<string, unknown> = {
    account_id: config.metaAdsAccountId,
    level: "campaign",
    filtering: [{ field: "campaign.id", operator: "EQUAL", value: [campaignId] }],
  }
  if (dateRange) {
    args.date_preset = dateRange
  }
  if (breakdowns) {
    args.breakdowns = breakdowns
  }

  const result = await callMcpTool("get_insights", args)
  return extractMcpText(result)
}

const searchTargetingOptions = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const query = input.query as string
  const type = (input.type as string) ?? "interests"

  if (!query) {
    return { content: "query is required", isError: true }
  }

  const typeToMcpTool: Record<string, string> = {
    interests: "search_interests",
    behaviors: "search_behaviors",
    demographics: "search_demographics",
    geo_locations: "search_geo_locations",
  }

  const mcpToolName = typeToMcpTool[type] ?? "search_interests"
  const result = await callMcpTool(mcpToolName, { q: query })
  return extractMcpText(result)
}

const createCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const name = input.name as string
  const objective = input.objective as string
  const dailyBudget = input.dailyBudget as number

  if (!name || !objective || !dailyBudget) {
    return { content: "name, objective, and dailyBudget are required", isError: true }
  }

  const budgetCheck = validateBudgetLimit(dailyBudget)
  if (!budgetCheck.valid) {
    return { content: budgetCheck.message, isError: true }
  }

  const dailyBudgetCentavos = Math.round(dailyBudget * 100)

  const result = await callMcpTool("create_campaign", {
    account_id: config.metaAdsAccountId,
    name,
    objective,
    daily_budget: dailyBudgetCentavos,
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const createAdSet = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string
  const name = input.name as string
  const targeting = input.targeting as Record<string, unknown>

  if (!campaignId || !name || !targeting) {
    return { content: "campaignId, name, and targeting are required", isError: true }
  }

  const result = await callMcpTool("create_ad_set", {
    account_id: config.metaAdsAccountId,
    campaign_id: campaignId,
    name,
    targeting,
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const createAd = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const adSetId = input.adSetId as string
  const name = input.name as string
  const headline = input.headline as string
  const text = input.text as string
  const imageUrl = input.imageUrl as string
  const linkUrl = input.linkUrl as string
  const pageId = input.pageId as string

  if (!adSetId || !name || !headline || !text || !imageUrl || !linkUrl || !pageId) {
    return { content: "adSetId, name, headline, text, imageUrl, linkUrl, and pageId are required", isError: true }
  }

  const creativeResult = await callMcpTool("create_ad_creative", {
    account_id: config.metaAdsAccountId,
    name: `${name} - Creative`,
    page_id: pageId,
    headline,
    text,
    image_url: imageUrl,
    link: linkUrl,
  })

  if (creativeResult.isError) {
    return extractMcpText(creativeResult)
  }

  const creativeText = creativeResult.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")

  let creativeId: string | undefined
  try {
    const parsed = JSON.parse(creativeText)
    creativeId = parsed.id ?? parsed.creative_id
  } catch {
    const idMatch = creativeText.match(/"id"\s*:\s*"(\d+)"/)
    creativeId = idMatch?.[1]
  }

  if (!creativeId) {
    return { content: `Failed to extract creative ID from response: ${creativeText}`, isError: true }
  }

  const adResult = await callMcpTool("create_ad", {
    account_id: config.metaAdsAccountId,
    ad_set_id: adSetId,
    name,
    creative_id: creativeId,
    status: "PAUSED",
  })
  return extractMcpText(adResult)
}

const activateCampaign = async (_input: Record<string, unknown>): Promise<ToolResult> => {
  const classification = classifyOperation("activateCampaign", _input)
  return guardedResponse(classification.reason ?? "Campaign activation requires human approval")
}

const pauseCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string

  if (!campaignId) {
    return { content: "campaignId is required", isError: true }
  }

  const result = await callMcpTool("update_campaign", {
    campaign_id: campaignId,
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const updateBudget = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string
  const newDailyBudget = input.newDailyBudget as number
  const currentDailyBudget = input.currentDailyBudget as number | undefined

  if (!campaignId || newDailyBudget === undefined) {
    return { content: "campaignId and newDailyBudget are required", isError: true }
  }

  const classification = classifyOperation("updateBudget", input)
  if (classification.level === "guarded") {
    return guardedResponse(classification.reason ?? "Budget increase requires human approval")
  }

  const budgetCheck = validateBudgetLimit(newDailyBudget)
  if (!budgetCheck.valid) {
    return { content: budgetCheck.message, isError: true }
  }

  const newBudgetCentavos = Math.round(newDailyBudget * 100)

  const result = await callMcpTool("update_campaign", {
    campaign_id: campaignId,
    daily_budget: newBudgetCentavos,
  })
  return extractMcpText(result)
}

const duplicateCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string
  const newName = input.newName as string

  if (!campaignId || !newName) {
    return { content: "campaignId and newName are required", isError: true }
  }

  const result = await callMcpTool("duplicate_campaign", {
    campaign_id: campaignId,
    name: newName,
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const comparePerformance = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignIds = input.campaignIds as string[]
  const dateRange = input.dateRange as string | undefined

  if (!campaignIds || campaignIds.length === 0) {
    return { content: "campaignIds array is required", isError: true }
  }

  const results = await Promise.all(
    campaignIds.map(async (campaignId) => {
      const args: Record<string, unknown> = {
        account_id: config.metaAdsAccountId,
        level: "campaign",
        filtering: [{ field: "campaign.id", operator: "EQUAL", value: [campaignId] }],
      }
      if (dateRange) {
        args.date_preset = dateRange
      }

      const result = await callMcpTool("get_insights", args)
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("")

      return { campaignId, insights: text, isError: result.isError }
    })
  )

  return { content: JSON.stringify(results) }
}

export const executeAdsTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getAdAccountOverview,
    listCampaigns,
    getCampaignInsights,
    searchTargetingOptions,
    createCampaign,
    createAdSet,
    createAd,
    activateCampaign,
    pauseCampaign,
    updateBudget,
    duplicateCampaign,
    comparePerformance,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown ads tool: ${toolName}`, isError: true }

  return handler(input)
}
