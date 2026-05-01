"use client"

import { useState, useEffect } from "react"
import { useUpdateAgentConfig } from "@/lib/queries/agent-queries"
import { Button } from "@/lib/components/ui/button"
import type { AgentConfig, InferenceConfig } from "@ozap-office/shared"

type Props = { agent: AgentConfig | null; open: boolean; onClose: () => void }

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (default)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (fast/cheap)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 (max quality)" },
] as const

const isEmpty = (c: InferenceConfig): boolean =>
  c.thinking === undefined &&
  c.model === undefined &&
  c.maxTokens === undefined &&
  c.temperature === undefined

export const AgentConfigPanel = ({ agent, open, onClose }: Props) => {
  const update = useUpdateAgentConfig()
  const [draft, setDraft] = useState<InferenceConfig>({})

  useEffect(() => {
    if (agent) setDraft(agent.inferenceConfig ?? {})
  }, [agent])

  if (!agent) return null

  const handleSave = () => {
    const cleaned = isEmpty(draft) ? null : draft
    update.mutate(
      { id: agent.id, inferenceConfig: cleaned },
      { onSuccess: onClose }
    )
  }

  const handleReset = () => {
    update.mutate(
      { id: agent.id, inferenceConfig: null },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 bg-surface border-l border-edge shadow-2xl z-50 transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h2 className="text-sm font-semibold">Config: {agent.name}</h2>
        <button
          onClick={onClose}
          className="text-mute hover:text-fg text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-7rem)]">
        <section className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={draft.thinking?.enabled ?? false}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  thinking: e.target.checked
                    ? {
                        enabled: true,
                        budgetTokens: draft.thinking?.budgetTokens ?? 4096,
                      }
                    : undefined,
                })
              }
            />
            Extended thinking
          </label>
          {draft.thinking?.enabled && (
            <div className="pl-6">
              <div className="text-[10px] text-mute mb-1">
                Budget: {draft.thinking.budgetTokens} tokens
              </div>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={draft.thinking.budgetTokens}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    thinking: {
                      enabled: true,
                      budgetTokens: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold">Model</label>
          <select
            value={draft.model ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                model: (e.target.value || undefined) as InferenceConfig["model"],
              })
            }
            className="w-full bg-canvas border border-edge rounded px-2 py-1 text-xs"
          >
            <option value="">Default (Sonnet 4.6)</option>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-2">
          <label className="flex justify-between text-xs font-semibold">
            <span>Max tokens</span>
            <span className="text-mute">
              {draft.maxTokens ?? "4096 (default)"}
            </span>
          </label>
          <input
            type="range"
            min={256}
            max={8192}
            step={256}
            value={draft.maxTokens ?? 4096}
            onChange={(e) =>
              setDraft({ ...draft, maxTokens: Number(e.target.value) })
            }
            className="w-full"
          />
        </section>

        <section className="space-y-2">
          <label className="flex justify-between text-xs font-semibold">
            <span>Temperature</span>
            <span className="text-mute">
              {draft.temperature !== undefined
                ? draft.temperature.toFixed(2)
                : "default"}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.temperature ?? 0.7}
            onChange={(e) =>
              setDraft({ ...draft, temperature: Number(e.target.value) })
            }
            className="w-full"
            disabled={draft.temperature === undefined}
          />
          <label className="flex items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={draft.temperature === undefined}
              onChange={(e) => {
                const next = { ...draft }
                if (e.target.checked) delete next.temperature
                else next.temperature = 0.7
                setDraft(next)
              }}
            />
            Use default (model decides)
          </label>
        </section>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 py-3 border-t border-edge flex gap-2 bg-surface">
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={update.isPending}
        >
          Reset to defaults
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={update.isPending}
          className="ml-auto"
        >
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
