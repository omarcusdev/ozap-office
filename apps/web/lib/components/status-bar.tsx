"use client"

import { useOffice } from "@/app/providers"

export const StatusBar = () => {
  const { agents } = useOffice()

  const counts = agents.reduce(
    (acc, a) => {
      if (a.status === "working" || a.status === "thinking") acc.working++
      else if (a.status === "waiting") acc.waiting++
      else if (a.status === "error") acc.error++
      else acc.idle++
      return acc
    },
    { working: 0, waiting: 0, error: 0, idle: 0 }
  )

  return (
    <div className="h-10 bg-gray-900 border-t border-white/10 flex items-center px-4 gap-6 text-xs">
      <span className="text-green-400">● {counts.working} working</span>
      <span className="text-yellow-400">● {counts.waiting} waiting approval</span>
      <span className="text-red-400">● {counts.error} error</span>
      <span className="text-gray-400">● {counts.idle} idle</span>
    </div>
  )
}
