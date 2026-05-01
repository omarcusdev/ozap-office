"use client"

import { useApprovals, useDecideApproval } from "@/lib/queries/approval-queries"
import { useAgentStore } from "@/lib/stores/agent-store"
import { Button } from "@/lib/components/ui/button"

type Props = { open: boolean; onClose: () => void }

export const ApprovalsPanel = ({ open, onClose }: Props) => {
  const { data: approvals = [] } = useApprovals()
  const decide = useDecideApproval()
  const agents = useAgentStore((s) => s.agents)

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? "Agent"

  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 bg-surface border-l border-edge shadow-2xl z-50 transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h2 className="text-sm font-semibold">Pending approvals</h2>
        <button
          onClick={onClose}
          className="text-mute hover:text-fg text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-3rem)]">
        {approvals.length === 0 && (
          <p className="text-xs text-mute">Nothing pending.</p>
        )}
        {approvals.map((a) => {
          const toolInput = (a as unknown as { toolInput: unknown }).toolInput
          const toolName = (a as unknown as { toolName: string }).toolName
          return (
            <div key={a.id} className="border border-edge rounded p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{agentName(a.agentId)}</span>
                <span className="text-mute">
                  {new Date(a.createdAt).toLocaleTimeString("pt-BR")}
                </span>
              </div>
              <div className="font-mono text-xs">{toolName}</div>
              <pre className="text-[10px] bg-canvas p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(toolInput, null, 2)}
              </pre>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, action: "reject" })}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, action: "approve" })}
                >
                  Approve
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
