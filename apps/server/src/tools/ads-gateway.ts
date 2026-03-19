import { config } from "../config.js"

type OperationLevel = "free" | "capped" | "guarded"

type Classification = {
  level: OperationLevel
  reason?: string
}

type BudgetValidation = {
  valid: boolean
  message: string
}

const FREE_OPERATIONS = new Set([
  "getAdAccountOverview",
  "listCampaigns",
  "getCampaignInsights",
  "searchTargetingOptions",
  "pauseCampaign",
  "comparePerformance",
])

const CAPPED_OPERATIONS = new Set([
  "createCampaign",
  "createAdSet",
  "createAd",
  "duplicateCampaign",
])

const GUARDED_OPERATIONS = new Set([
  "activateCampaign",
])

export const classifyOperation = (
  toolName: string,
  input: Record<string, unknown>
): Classification => {
  if (FREE_OPERATIONS.has(toolName)) {
    return { level: "free" }
  }

  if (CAPPED_OPERATIONS.has(toolName)) {
    return { level: "capped" }
  }

  if (GUARDED_OPERATIONS.has(toolName)) {
    return { level: "guarded", reason: `${toolName} requires human approval` }
  }

  if (toolName === "updateBudget") {
    const newDailyBudget = input.newDailyBudget as number | undefined
    const currentDailyBudget = input.currentDailyBudget as number | undefined

    if (newDailyBudget !== undefined && currentDailyBudget !== undefined && newDailyBudget > currentDailyBudget) {
      return { level: "guarded", reason: "Budget increase requires human approval" }
    }

    return { level: "free" }
  }

  return { level: "free" }
}

export const validateBudgetLimit = (dailyBudget: number): BudgetValidation => {
  if (dailyBudget <= 0) {
    return { valid: false, message: "Daily budget must be greater than zero" }
  }

  if (dailyBudget > config.adsDailyBudgetLimit) {
    return {
      valid: false,
      message: `Daily budget R$${dailyBudget} exceeds the limit of R$${config.adsDailyBudgetLimit}`,
    }
  }

  return { valid: true, message: `Daily budget R$${dailyBudget} is within the allowed limit` }
}
