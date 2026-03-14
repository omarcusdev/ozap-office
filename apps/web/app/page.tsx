import { OfficeProvider } from "./providers"
import { OfficeCanvas } from "@/lib/components/office-canvas"
import { ThoughtPanel } from "@/lib/components/thought-panel"
import { StatusBar } from "@/lib/components/status-bar"

export default function OfficePage() {
  return (
    <OfficeProvider>
      <div className="h-screen flex flex-col">
        <header className="h-12 bg-gray-900 border-b border-white/10 flex items-center px-4">
          <h1 className="text-lg font-bold tracking-tight">ozap-office</h1>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-gray-950">
            <OfficeCanvas />
          </div>
          <ThoughtPanel />
        </div>

        <StatusBar />
      </div>
    </OfficeProvider>
  )
}
