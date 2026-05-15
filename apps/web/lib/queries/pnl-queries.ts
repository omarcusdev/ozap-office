import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"

export const usePnl = (month?: string) =>
  useQuery({
    queryKey: ["pnl", month ?? "current"],
    queryFn: () => api.fetchPnl(month),
    staleTime: 5 * 60 * 1000,
  })
