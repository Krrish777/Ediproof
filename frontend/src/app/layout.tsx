import type { Metadata } from 'next'
import { Newsreader, IBM_Plex_Serif, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import Masthead from '@/components/Masthead'
import Colophon from '@/components/Colophon'

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['200', '400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Édiproof — The ledger of verified learning',
  description: 'Blockchain-based academic certificate verification. Certificates issued as Soulbound Tokens on Sepolia testnet.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${ibmPlexSerif.variable} ${ibmPlexMono.variable}`}
      style={{
        '--font-display': newsreader.style.fontFamily,
        '--font-body': ibmPlexSerif.style.fontFamily,
        '--font-mono': ibmPlexMono.style.fontFamily,
      } as React.CSSProperties}
    >
      <body>
        <Masthead />
        <main>
          {children}
        </main>
        <Colophon />
      </body>
    </html>
  )
}
