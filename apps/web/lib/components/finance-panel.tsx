"use client"

import { useState } from "react"
import { usePnl } from "@/lib/queries/pnl-queries"
import type { PnlCategoryRow } from "@ozap-office/shared"

const formatBrl = (cents: number): string => {
  const reais = cents / 100
  if (reais >= 1000) return `R$${(reais / 1000).toFixed(1)}k`
  return `R$${reais.toFixed(2).replace(".", ",")}`
}

const currentMonth = (): string => {
  const now = new Date()
  const tzOffset = -3 * 60
  const local = new Date(now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60_000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`
}

const shiftMonth = (month: string, delta: number): string => {
  const [year, monthIdx] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year, monthIdx - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

const monthLabel = (month: string): string => {
  const [year, monthIdx] = month.split("-").map(Number)
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return `${names[monthIdx - 1]}/${String(year).slice(2)}`
}

const categoryLabel: Record<string, string> = {
  card_payment: "Cartão",
  pix: "Pix",
  payroll: "Salário",
  ai_api: "API de IA",
  infra: "Infraestrutura",
}

const sourceLabel: Record<string, string> = {
  cakto: "Cakto",
  abacatepay: "AbacatePay",
  salary: "Pedro",
  openai: "OpenAI",
  aws: "AWS",
}

const rowLabel = (row: PnlCategoryRow): string => {
  const cat = categoryLabel[row.category] ?? row.category
  const src = sourceLabel[row.source] ?? row.source
  return `${src} (${cat})`
}

const Skeleton = () => (
  <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 bg-raised border border-edge rounded animate-pulse" />
      ))}
    </div>
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-6 bg-raised/50 rounded animate-pulse" />
      ))}
    </div>
  </div>
)

const MonthNav = ({
  selected,
  onChange,
}: {
  selected: string
  onChange: (m: string) => void
}) => {
  const isCurrent = selected === currentMonth()
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(shiftMonth(selected, -1))}
        className="px-1.5 py-0.5 text-mute hover:text-sand transition-colors"
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <span className="text-mute text-xs min-w-[48px] text-center">{monthLabel(selected)}</span>
      <button
        onClick={() => !isCurrent && onChange(shiftMonth(selected, 1))}
        disabled={isCurrent}
        className="px-1.5 py-0.5 text-mute hover:text-sand transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Mês seguinte"
      >
        ›
      </button>
    </div>
  )
}

export const FinancePanel = () => {
  const [month, setMonth] = useState<string>(currentMonth())
  const { data, isLoading, error, refetch } = usePnl(month)

  if (isLoading && !data) {
    return (
      <div className="bg-panel border border-edge rounded-lg p-4">
        <Skeleton />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-panel border border-edge rounded-lg p-4 text-center">
        <p className="text-sand text-sm mb-3">Não foi possível carregar finanças</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-xs uppercase tracking-widest text-gold border border-gold/30 rounded hover:bg-gold/10"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const { kpis, revenueByCategory, costByCategory } = data
  const hasData = revenueByCategory.length > 0 || costByCategory.length > 0

  return (
    <div className="bg-panel border border-edge rounded-lg p-4 text-cream text-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-gold font-semibold">P&L</h4>
        <MonthNav selected={month} onChange={setMonth} />
      </div>

      <div className="grid grid-cols-3 gap-2 my-3">
        <div className="bg-raised border border-edge rounded p-2.5">
          <div className="text-[10px] uppercase text-mute tracking-wider">Receita</div>
          <div className="text-lg font-semibold text-sage mt-0.5">{formatBrl(kpis.revenueBrlCents)}</div>
        </div>
        <div className="bg-raised border border-edge rounded p-2.5">
          <div className="text-[10px] uppercase text-mute tracking-wider">Custos</div>
          <div className="text-lg font-semibold text-coral mt-0.5">{formatBrl(kpis.costBrlCents)}</div>
        </div>
        <div className="bg-raised border border-edge rounded p-2.5">
          <div className="text-[10px] uppercase text-mute tracking-wider">Lucro</div>
          <div className="text-lg font-semibold text-gold mt-0.5">{formatBrl(kpis.profitBrlCents)}</div>
        </div>
      </div>

      {!hasData && (
        <p className="text-mute text-xs text-center py-3">Sem dados para {monthLabel(month)}</p>
      )}

      {revenueByCategory.length > 0 && (
        <>
          <div className="text-[10px] uppercase text-mute tracking-wider mt-3 mb-1">Receita</div>
          {revenueByCategory.map((row) => (
            <div key={`r-${row.source}-${row.category}`} className="flex justify-between py-1.5 border-b border-edge text-xs">
              <span className="text-sand">{rowLabel(row)}</span>
              <span className="text-sage">{formatBrl(row.amountBrlCents)}</span>
            </div>
          ))}
        </>
      )}

      {costByCategory.length > 0 && (
        <>
          <div className="text-[10px] uppercase text-mute tracking-wider mt-3 mb-1">Custos</div>
          {costByCategory.map((row) => (
            <div key={`c-${row.source}-${row.category}`} className="flex justify-between py-1.5 border-b border-edge text-xs">
              <span className="text-sand">{rowLabel(row)}</span>
              <span className={row.amountBrlCents === 0 ? "text-mute" : "text-coral"}>
                {formatBrl(row.amountBrlCents)}
              </span>
            </div>
          ))}
        </>
      )}

      <div className="flex justify-between pt-3 mt-2 border-t-2 border-gold font-semibold">
        <span>Lucro líquido</span>
        <span className="text-gold">{formatBrl(kpis.profitBrlCents)}</span>
      </div>
    </div>
  )
}
