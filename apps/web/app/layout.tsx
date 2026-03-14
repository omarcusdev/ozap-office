import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ozap-office",
  description: "AI Agent Team Digital Office",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white">{children}</body>
    </html>
  )
}
