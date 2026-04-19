'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import WalletChip from './WalletChip'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/issue', label: 'Issue' },
  { href: '/verify', label: 'Verify' },
  { href: '/my-leaves', label: 'My Leaves' },
]

export default function Masthead() {
  const pathname = usePathname()

  return (
    <header className="masthead">
      <div className="container">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '2rem',
          }}
        >
          {/* Wordmark */}
          <Link
            href="/"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 0 }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1.75rem',
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              ÉDI
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontStyle: 'italic',
                fontSize: '1.75rem',
                color: 'var(--oxblood)',
                letterSpacing: '-0.02em',
              }}
            >
              proof
            </span>
          </Link>

          {/* Tagline — hidden on small screens */}
          <span
            className="label"
            style={{
              flex: 1,
              paddingLeft: '2rem',
              borderLeft: '1px solid var(--ink)',
              display: 'block',
            }}
          >
            The ledger of verified learning
          </span>

          {/* Nav */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
            }}
          >
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    color: isActive ? 'var(--oxblood)' : 'var(--ink-faded)',
                    textDecoration: 'none',
                    borderBottom: isActive ? '1px solid var(--oxblood)' : '1px solid transparent',
                    paddingBottom: '2px',
                  }}
                >
                  {label}
                </Link>
              )
            })}
            <WalletChip />
          </nav>
        </div>
      </div>
    </header>
  )
}
