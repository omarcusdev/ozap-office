import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../api-client"

export const useApprovals = () =>
  useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.getApprovals(),
    refetchInterval: 30_000,
  })

export const useDecideApproval = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api.decideApproval(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  })
}
