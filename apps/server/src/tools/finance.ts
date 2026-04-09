import { fetchOrders, fetchProducts, fetchAllOrders } from "../integrations/cakto-client.js"

type ToolResult = { content: string; isError?: boolean }

const getOrders = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const response = await fetchOrders({
      startDate: input.startDate as string | undefined,
      endDate: input.endDate as string | undefined,
      status: input.status as string | undefined,
      productId: input.productId as string | undefined,
      limit: (input.limit as number) ?? 20,
    })

    const orders = response.results.map((o) => ({
      id: o.id,
      refId: o.refId,
      type: o.type,
      status: o.status,
      amount: o.amount,
      product: o.product.name,
      customer: o.customer.name,
      paymentMethod: o.paymentMethod,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
      utmSource: o.utm_source,
      utmMedium: o.utm_medium,
      utmCampaign: o.utm_campaign,
      sck: o.sck,
      isAffiliate: Array.isArray(o.commissions) && o.commissions.some(c => c.type === "affiliate"),
    }))

    return { content: JSON.stringify({ count: response.count, orders }) }
  } catch (error) {
    return { content: `Failed to fetch orders: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getProducts = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const response = await fetchProducts({
      status: input.status as string | undefined,
      search: input.search as string | undefined,
      limit: (input.limit as number) ?? 20,
    })

    const products = response.results.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      type: p.type,
      status: p.status,
      category: p.category.name,
    }))

    return { content: JSON.stringify({ count: response.count, products }) }
  } catch (error) {
    return { content: `Failed to fetch products: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getRevenueSummary = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const startDate = input.startDate as string
    const endDate = input.endDate as string

    if (!startDate || !endDate) {
      return { content: "startDate and endDate are required", isError: true }
    }

    const orders = await fetchAllOrders({ startDate, endDate, status: "paid" })

    const totalRevenue = orders.reduce((sum, o) => sum + (o.amount ?? 0), 0)
    const orderCount = orders.length
    const averageTicket = orderCount > 0 ? totalRevenue / orderCount : 0

    const productMap = new Map<string, { revenue: number; count: number }>()
    for (const order of orders) {
      const name = order.product.name
      const existing = productMap.get(name) ?? { revenue: 0, count: 0 }
      productMap.set(name, {
        revenue: existing.revenue + (order.amount ?? 0),
        count: existing.count + 1,
      })
    }

    const paymentMap = new Map<string, { revenue: number; count: number }>()
    for (const order of orders) {
      const method = order.paymentMethod
      const existing = paymentMap.get(method) ?? { revenue: 0, count: 0 }
      paymentMap.set(method, {
        revenue: existing.revenue + (order.amount ?? 0),
        count: existing.count + 1,
      })
    }

    const typeMap = new Map<string, { revenue: number; count: number }>()
    for (const order of orders) {
      const type = order.type ?? "unknown"
      const existing = typeMap.get(type) ?? { revenue: 0, count: 0 }
      typeMap.set(type, {
        revenue: existing.revenue + (order.amount ?? 0),
        count: existing.count + 1,
      })
    }

    const summary = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      orderCount,
      averageTicket: Math.round(averageTicket * 100) / 100,
      byProduct: [...productMap.entries()]
        .map(([name, data]) => ({ name, revenue: Math.round(data.revenue * 100) / 100, count: data.count }))
        .sort((a, b) => b.revenue - a.revenue),
      byType: [...typeMap.entries()]
        .map(([type, data]) => ({ type, revenue: Math.round(data.revenue * 100) / 100, count: data.count }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: [...paymentMap.entries()]
        .map(([method, data]) => ({ method, revenue: Math.round(data.revenue * 100) / 100, count: data.count }))
        .sort((a, b) => b.revenue - a.revenue),
      period: { start: startDate, end: endDate },
    }

    return { content: JSON.stringify(summary) }
  } catch (error) {
    return { content: `Failed to generate revenue summary: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

export const executeFinanceTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getOrders,
    getProducts,
    getRevenueSummary,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown finance tool: ${toolName}`, isError: true }

  return handler(input)
}
