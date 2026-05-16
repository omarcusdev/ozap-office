import { config } from "../config.js"

const OPENAI_BASE_URL = "https://api.openai.com/v1"

type CostAmount = {
  value: number
  currency: string
}

type CostResult = {
  object: "organization.costs.result"
  amount: CostAmount
  line_item: string | null
  project_id: string | null
}

type CostBucket = {
  object: "bucket"
  start_time: number
  end_time: number
  results: CostResult[]
}

type CostsPage = {
  object: "page"
  data: CostBucket[]
  has_more: boolean
  next_page: string | null
}

const assertAdminKey = () => {
  if (!config.openaiAdminApiKey) {
    throw new Error("OpenAI admin key not configured (OPENAI_ADMIN_API_KEY)")
  }
}

const openaiRequest = async (path: string): Promise<CostsPage> => {
  assertAdminKey()

  const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${config.openaiAdminApiKey}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${text}`)
  }

  return response.json() as Promise<CostsPage>
}

const fetchCostsPage = (startUnix: number, endUnix: number, page?: string): Promise<CostsPage> => {
  const params = new URLSearchParams({
    start_time: String(startUnix),
    end_time: String(endUnix),
    bucket_width: "1d",
    limit: "180",
  })
  if (page) params.set("page", page)
  return openaiRequest(`/organization/costs?${params.toString()}`)
}

const accumulatePages = async (
  startUnix: number,
  endUnix: number,
  page: string | undefined,
  accumulated: CostBucket[]
): Promise<CostBucket[]> => {
  const result = await fetchCostsPage(startUnix, endUnix, page)
  const updated = [...accumulated, ...result.data]
  if (!result.has_more || !result.next_page) return updated
  return accumulatePages(startUnix, endUnix, result.next_page, updated)
}

export type DailyCost = {
  date: string
  amountUsdCents: number
}

export const fetchDailyCosts = async (startUnix: number, endUnix: number): Promise<DailyCost[]> => {
  const buckets = await accumulatePages(startUnix, endUnix, undefined, [])
  return buckets.map((bucket) => {
    const totalUsd = bucket.results.reduce((sum, r) => sum + (r.amount?.value ?? 0), 0)
    const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10)
    return {
      date,
      amountUsdCents: Math.round(totalUsd * 100),
    }
  })
}
