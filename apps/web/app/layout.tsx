import type { Metadata } from "next"
import { Bricolage_Grotesque, Martian_Mono } from "next/font/google"
import "./globals.css"

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const monoFont = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "ozap-office",
  description: "AI Agent Team Digital Office",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${monoFont.variable} bg-canvas text-cream`}>
        {children}
      </body>
    </html>
  )
}
