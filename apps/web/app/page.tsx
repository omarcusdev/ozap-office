"use client"

import { OfficeProvider, useOffice } from "./providers"
import { OfficeCanvas } from "@/lib/components/office-canvas"
import { ThoughtPanel } from "@/lib/components/thought-panel"
import { StatusBar } from "@/lib/components/status-bar"

const MeetingButton = () => {
  const { inMeeting, callMeeting, endMeeting } = useOffice()

  return (
    <button
      onClick={inMeeting ? endMeeting : callMeeting}
      className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
        inMeeting
          ? "bg-red-600 hover:bg-red-500 text-white"
          : "bg-amber-600 hover:bg-amber-500 text-white"
      }`}
    >
      {inMeeting ? "End Meeting" : "Call Meeting"}
    </button>
  )
}

const OfficeContent = () => (
  <div className="h-screen flex flex-col bg-gray-950">
    <header className="h-12 bg-gray-900/80 border-b border-white/10 flex items-center px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-xs font-bold">O</div>
        <h1 className="text-sm font-bold tracking-tight">ozap-office</h1>
      </div>
      <div className="ml-4">
        <MeetingButton />
      </div>
      <div className="ml-auto text-xs text-gray-500">AI Agent Team</div>
    </header>

    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex items-center justify-center bg-[#0a0a14]">
        <OfficeCanvas />
      </div>
      <ThoughtPanel />
    </div>

    <StatusBar />
  </div>
)

export default function OfficePage() {
  return (
    <OfficeProvider>
      <OfficeContent />
    </OfficeProvider>
  )
}
