import { config } from "../config.js"

type Classification = { level: "free" | "guarded"; reason?: string }

const GUARDED_OPS: Record<
  string,
  (input: Record<string, unknown>) => Classification
> = {
  activateCampaign: () => ({
    level: "guarded",
    reason: "Activating a campaign spends real money on Meta Ads",
  }),
  updateBudget: (input) => {
    const newDailyBudget = input.newDailyBudget as number | undefined
    const currentDailyBudget = input.currentDailyBudget as number | undefined
    if (
      newDailyBudget !== undefined &&
      currentDailyBudget !== undefined &&
      newDailyBudget > currentDailyBudget
    ) {
      return {
        level: "guarded",
        reason: "Budget increase spends more real money on Meta Ads",
      }
    }
    return { level: "free" }
  },
}

export const classifyToolCall = (
  toolName: string,
  input: Record<string, unknown>
): Classification => {
  const checker = GUARDED_OPS[toolName]
  return checker ? checker(input) : { level: "free" }
}

type BudgetValidation = { valid: boolean; message: string }

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
  return {
    valid: true,
    message: `Daily budget R$${dailyBudget} is within the allowed limit`,
  }
}
