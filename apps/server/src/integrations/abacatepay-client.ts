import { config } from "../config.js"

const ABACATEPAY_BASE_URL = "https://api.abacatepay.com/v1"

type AbacatepayBilling = {
  id: string
  amount: number
  paidAmount: number
  status: string
  frequency: string
  createdAt: string
  updatedAt: string
}

const abacatepayHeaders = () => ({
  Authorization: `Bearer ${config.abacatepayApiKey}`,
  "Content-Type": "application/json",
})

const assertApiKey = () => {
  if (!config.abacatepayApiKey) {
    throw new Error("AbacatePay API key not configured (ABACATEPAY_API_KEY)")
  }
}

export const fetchBillingPaidAmount = async (billId: string): Promise<number> => {
  assertApiKey()

  const response = await fetch(`${ABACATEPAY_BASE_URL}/billing/list`, {
    headers: abacatepayHeaders(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AbacatePay API error (${response.status}): ${text}`)
  }

  const body = await response.json() as { data: AbacatepayBilling[] }
  const billing = body.data.find((b) => b.id === billId)

  if (!billing) {
    throw new Error(`AbacatePay billing not found: ${billId}`)
  }

  return billing.paidAmount ?? 0
}
