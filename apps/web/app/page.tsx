"use client"

import { OfficeProvider } from "./providers"
import { OfficeCanvas } from "@/lib/components/office-canvas"
import { ThoughtPanel } from "@/lib/components/thought-panel"
import { StatusBar } from "@/lib/components/status-bar"
import { useAgentsAnimation } from "@/lib/hooks/use-agents-animation"

const MeetingButton = () => {
  const { inMeeting, callMeeting, endMeeting } = useAgentsAnimation()

  return (
    <button
      onClick={inMeeting ? endMeeting : callMeeting}
      className={`px-4 py-1.5 text-[11px] font-semibold tracking-widest uppercase transition-all duration-200 rounded-sm ${
        inMeeting
          ? "bg-coral/15 text-coral border border-coral/30 hover:bg-coral/25"
          : "bg-gold/10 text-gold border border-gold/25 hover:bg-gold/20"
      }`}
    >
      {inMeeting ? "End Meeting" : "Call Meeting"}
    </button>
  )
}

const OfficeContent = () => (
  <div className="h-screen flex flex-col bg-canvas">
    <header className="h-14 bg-surface/90 border-b border-edge flex items-center px-5 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-gold rounded-sm flex items-center justify-center text-xs font-bold text-canvas">
          O
        </div>
        <h1 className="text-[15px] font-semibold tracking-tight">
          ozap<span className="text-mute">.</span>office
        </h1>
      </div>
      <div className="ml-auto">
        <MeetingButton />
      </div>
    </header>

    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex items-center justify-center bg-canvas">
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
