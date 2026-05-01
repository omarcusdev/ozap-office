import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { InferenceConfig } from "@ozap-office/shared"
import { api } from "@/lib/api-client"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useEffect } from "react"

export const useAgentsQuery = () => {
  const setAgents = useAgentStore((s) => s.setAgents)

  const query = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (query.data) {
      setAgents(query.data.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        color: a.color,
        positionX: (a as any).positionX ?? a.position?.x ?? 0,
        positionY: (a as any).positionY ?? a.position?.y ?? 0,
        status: a.status,
      })))
    }
  }, [query.data, setAgents])

  return query
}

export const useLatestRunQuery = (agentId: string | null) =>
  useQuery({
    queryKey: ["latest-run", agentId],
    queryFn: () => api.getLatestRun(agentId!),
    enabled: !!agentId,
  })

export const useTaskRunEventsQuery = (agentId: string | null, taskRunId: string | null) =>
  useQuery({
    queryKey: ["task-run-events", agentId, taskRunId],
    queryFn: () => api.getTaskRunEvents(agentId!, taskRunId!),
    enabled: !!agentId && !!taskRunId,
  })

export const useUpdateAgentConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      inferenceConfig,
    }: {
      id: string
      inferenceConfig: InferenceConfig | null
    }) => api.updateAgentConfig(id, inferenceConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  })
}
