import { useQuery } from "@tanstack/react-query"
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
      setAgents(query.data as any)
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
