import type { Metadata, Viewport } from "next"
import { DM_Serif_Display, Geist, Geist_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import { themeInitScript } from "@/lib/theme-script"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const serif = DM_Serif_Display({ variable: "--font-dm-serif", subsets: ["latin"], weight: "400" })

export const metadata: Metadata = {
  title: { default: "LEXA — Almeida & Associados", template: "%s · LEXA" },
  description: "Gestão jurídica para escritórios de advocacia: clientes, processos, prazos e agenda em um só lugar.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F8F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E0D" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
