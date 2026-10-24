import type { Metadata, Viewport } from "next"
import { Instrument_Sans, JetBrains_Mono, Newsreader } from "next/font/google"
import "@xyflow/react/dist/base.css"
import "./globals.css"

// Interface sem serifa; títulos editoriais em serifada discreta; metadados em mono.
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" })
const serif = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", style: ["normal", "italic"] })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" })

export const metadata: Metadata = {
  title: { default: "Mesa", template: "%s · Mesa" },
  description: "Centro de comando pessoal: tarefas, diário, páginas, projetos e quadros visuais.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#171A21",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
