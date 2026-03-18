import { config } from "../config.js"

type OrderFilters = {
  startDate?: string
  endDate?: string
  status?: string
  productId?: string
  limit?: number
  page?: number
}

type ProductFilters = {
  status?: string
  search?: string
  limit?: number
  page?: number
}

type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

type CaktoOrder = {
  id: string
  refId: string
  status: string
  type: string
  amount: number | null
  baseAmount: number
  discount: number | null
  product: { id: string; name: string; price: number }
  customer: { name: string; email?: string }
  paymentMethod: string
  installments: number
  paidAt: string | null
  createdAt: string
  refundedAt: string | null
  chargedbackAt: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  sck: string | null
  checkoutUrl: string | null
  commissions: Array<{
    userId: string
    type: string
    commissionPercentage: number
    commissionValue: number
  }> | null
}

type CaktoProduct = {
  id: string
  name: string
  price: number
  type: string
  status: string
  category: { id: string; name: string }
}

type TokenState = {
  accessToken: string
  expiresAt: number
}

const CAKTO_BASE_URL = "https://api.cakto.com.br"
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

const tokenPromise: { current: Promise<TokenState> | null } = { current: null }

const assertCredentials = () => {
  if (!config.caktoClientId || !config.caktoClientSecret) {
    throw new Error("Cakto API credentials not configured (CAKTO_CLIENT_ID, CAKTO_CLIENT_SECRET)")
  }
}

const fetchToken = async (): Promise<TokenState> => {
  assertCredentials()

  const response = await fetch(`${CAKTO_BASE_URL}/public_api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.caktoClientId,
      client_secret: config.caktoClientSecret,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cakto auth failed (${response.status}): ${text}`)
  }

  const data = await response.json() as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

const isTokenExpired = async (): Promise<boolean> => {
  if (!tokenPromise.current) return true
  try {
    const state = await tokenPromise.current
    return Date.now() >= state.expiresAt - TOKEN_REFRESH_MARGIN_MS
  } catch {
    return true
  }
}

const getValidToken = async (): Promise<string> => {
  if (await isTokenExpired()) {
    tokenPromise.current = fetchToken()
  }
  const state = await tokenPromise.current!
  return state.accessToken
}

const caktoRequest = async <T>(path: string, retried = false): Promise<T> => {
  const token = await getValidToken()

  const response = await fetch(`${CAKTO_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (response.status === 401 && !retried) {
    tokenPromise.current = null
    return caktoRequest<T>(path, true)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cakto API error (${response.status}): ${text}`)
  }

  return response.json() as Promise<T>
}

const buildOrderQuery = (filters: OrderFilters): string => {
  const params = new URLSearchParams()
  if (filters.startDate) params.set("createdAt__gte", filters.startDate)
  if (filters.endDate) params.set("createdAt__lte", filters.endDate)
  if (filters.status) params.set("status", filters.status)
  if (filters.productId) params.set("product", filters.productId)
  params.set("limit", String(filters.limit ?? 50))
  if (filters.page) params.set("page", String(filters.page))
  params.set("ordering", "-createdAt")
  return params.toString()
}

const buildProductQuery = (filters: ProductFilters): string => {
  const params = new URLSearchParams()
  if (filters.status) params.set("status", filters.status)
  if (filters.search) params.set("search", filters.search)
  params.set("limit", String(filters.limit ?? 50))
  if (filters.page) params.set("page", String(filters.page))
  return params.toString()
}

export const fetchOrders = async (filters: OrderFilters = {}): Promise<PaginatedResponse<CaktoOrder>> =>
  caktoRequest<PaginatedResponse<CaktoOrder>>(`/public_api/orders/?${buildOrderQuery(filters)}`)

export const fetchProducts = async (filters: ProductFilters = {}): Promise<PaginatedResponse<CaktoProduct>> =>
  caktoRequest<PaginatedResponse<CaktoProduct>>(`/public_api/products/?${buildProductQuery(filters)}`)

const fetchOrderPage = async (filters: OrderFilters, page: number, pageSize: number): Promise<PaginatedResponse<CaktoOrder>> =>
  fetchOrders({ ...filters, limit: pageSize, page })

const accumulateOrderPages = async (
  filters: OrderFilters,
  pageSize: number,
  maxOrders: number,
  page: number,
  accumulated: CaktoOrder[]
): Promise<CaktoOrder[]> => {
  const response = await fetchOrderPage(filters, page, pageSize)
  const updated = [...accumulated, ...response.results]

  if (!response.next || updated.length >= maxOrders) {
    return updated.slice(0, maxOrders)
  }

  const maxPages = Math.ceil(maxOrders / pageSize)
  if (page >= maxPages) {
    return updated.slice(0, maxOrders)
  }

  return accumulateOrderPages(filters, pageSize, maxOrders, page + 1, updated)
}

export const fetchAllOrders = async (filters: OrderFilters): Promise<CaktoOrder[]> =>
  accumulateOrderPages(filters, 50, 500, 1, [])
