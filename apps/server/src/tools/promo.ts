import { config } from "../config.js"

type ToolResult = { content: string; isError?: boolean }

const GITHUB_API_URL = "https://api.github.com/repos/omarcusdev/zap-landing/contents/src/config/promo-config.json"

const PAYMENT_CONFIG = {
  price: "R$197,00",
  priceOriginal: "R$497",
  installments: "12x de R$19,67",
  savings: "ECONOMIA DE R$ 300",
  pixLink: "https://app.abacatepay.com/pay/bill_ZM4Pm0PgHpjfWzPQ5eRthqjx",
  cardLink: "https://pay.cakto.com.br/39jee69",
  defaultPixLink: "https://app.abacatepay.com/pay/bill_yqqpmYHWQGT1D3yCXdxJZCMs",
  defaultCardLink: "https://pay.cakto.com.br/ijjptyj",
  defaultPrice: "R$397,00",
  defaultInstallments: "12x de R$39,67",
}

const githubHeaders = () => ({
  Authorization: `Bearer ${config.githubToken}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
})

const calculatePromoStatus = (endDate: string) => {
  const end = new Date(endDate)
  const now = new Date()
  const msRemaining = end.getTime() - now.getTime()
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
  const isExpired = msRemaining < 0
  return { isExpired, daysRemaining }
}

const getActivePromo = async (_input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const response = await fetch(GITHUB_API_URL, { headers: githubHeaders() })

    if (response.status === 404) {
      return { content: JSON.stringify({ exists: false, message: "No promo config found. Use updatePromoConfig to create one." }) }
    }

    if (!response.ok) {
      return { content: `GitHub API error: ${response.status} ${response.statusText}`, isError: true }
    }

    const data = await response.json() as { sha: string; content: string }
    const decoded = Buffer.from(data.content, "base64").toString("utf-8")
    const promoConfig = JSON.parse(decoded)

    const { isExpired, daysRemaining } = calculatePromoStatus(promoConfig.endDate)

    return {
      content: JSON.stringify({
        exists: true,
        sha: data.sha,
        isExpired,
        daysRemaining,
        config: promoConfig,
      }),
    }
  } catch (error) {
    return { content: `Failed to fetch promo config: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const updatePromoConfig = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const promoName = input.promoName as string | undefined
    const endDate = input.endDate as string | undefined
    const badgeText = input.badgeText as string | undefined
    const emoji = input.emoji as string | undefined
    const isActive = input.isActive as boolean | undefined

    if (!promoName || !endDate || !badgeText) {
      return { content: "promoName, endDate, and badgeText are required", isError: true }
    }

    const currentResponse = await fetch(GITHUB_API_URL, { headers: githubHeaders() })

    const existingSha = currentResponse.ok
      ? ((await currentResponse.json()) as { sha: string }).sha
      : undefined

    const promoConfig = {
      promoName,
      emoji: emoji ?? "",
      endDate,
      badgeText,
      isActive: isActive ?? true,
      ...PAYMENT_CONFIG,
    }

    const commitMessage = `promo: ${promoName} until ${endDate}`
    const encodedContent = Buffer.from(JSON.stringify(promoConfig, null, 2)).toString("base64")

    const body: Record<string, unknown> = {
      message: commitMessage,
      content: encodedContent,
    }

    if (existingSha) {
      body.sha = existingSha
    }

    const putResponse = await fetch(GITHUB_API_URL, {
      method: "PUT",
      headers: githubHeaders(),
      body: JSON.stringify(body),
    })

    if (!putResponse.ok) {
      const errorText = await putResponse.text()
      return { content: `Failed to update promo config: ${putResponse.status} ${errorText}`, isError: true }
    }

    return { content: JSON.stringify({ success: true, config: promoConfig }) }
  } catch (error) {
    return { content: `Failed to update promo config: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

export const executePromoTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getActivePromo,
    updatePromoConfig,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown promo tool: ${toolName}`, isError: true }

  return handler(input)
}
