'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ActivityStrip from '@/components/ActivityStrip'
import { fetchStats, fetchActivity, Stats, ActivityItem } from '@/lib/api'
import { timeAgo, truncateAddress } from '@/lib/hash'

const CONTRACT_ADDRESS = '0x14Cf79F1ef984db755f0803E215FB12038Ad64d5'
const ETHERSCAN_URL = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`

const kindLabel: Record<string, string> = {
  issued: 'Issued',
  verified: 'Verified',
  revoked: 'Revoked',
  reissued: 'Reissued',
  forgery_attempt: 'Forgery',
}

const kindColor: Record<string, string> = {
  issued: 'var(--moss)',
  verified: 'var(--brass)',
  revoked: 'var(--error)',
  reissued: 'var(--brass-light)',
  forgery_attempt: 'var(--error)',
}

export default function LandingPage() {
  const [stats, setStats] = useState<Stats>({ totalIssued: 0, institutionCount: 0, totalVerified: 0, forgeryCount: 0 })
  const [activity, setActivity] = useState<ActivityItem[]>([])

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {})
    fetchActivity(6).then(setActivity).catch(() => {})
  }, [])

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section style={{ borderBottom: '1px solid var(--ink)', padding: '5rem 0' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
            {/* Left */}
            <div>
              <p className="label" style={{ marginBottom: '1.5rem', color: 'var(--brass)' }}>
                Vol. I — Sepolia Edition
              </p>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 200,
                  fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                  lineHeight: 1.1,
                  marginBottom: '2rem',
                  color: 'var(--ink)',
                }}
              >
                Diplomas cast in{' '}
                <em style={{ color: 'var(--oxblood)' }}>cryptography</em>,
                held for <em style={{ color: 'var(--oxblood)' }}>good</em>.
              </h1>
              <p
                style={{
                  fontSize: '1rem',
                  color: 'var(--ink-faded)',
                  lineHeight: '1.7',
                  marginBottom: '2.5rem',
                  maxWidth: '480px',
                }}
              >
                Ediproof issues academic certificates as Soulbound Tokens — cryptographic
                proofs permanently bound to a student's wallet, verifiable by anyone,
                anywhere, without trusting any institution.
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Link href="/issue" className="btn btn-oxblood">
                  Issue a Certificate →
                </Link>
                <Link href="/verify" className="btn btn-ghost">
                  Verify existing
                </Link>
              </div>

              {/* Contract metadata row */}
              <div
                style={{
                  marginTop: '3rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid var(--vellum-3)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1rem',
                }}
              >
                <div>
                  <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem' }}>Network</p>
                  <p className="mono" style={{ fontSize: '0.75rem' }}>Sepolia</p>
                </div>
                <div>
                  <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem' }}>Standard</p>
                  <p className="mono" style={{ fontSize: '0.75rem' }}>ERC-721 SBT</p>
                </div>
                <div>
                  <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem' }}>Contract</p>
                  <a
                    href={ETHERSCAN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{ fontSize: '0.75rem', color: 'var(--oxblood)' }}
                  >
                    {truncateAddress(CONTRACT_ADDRESS)}
                  </a>
                </div>
              </div>
            </div>

            {/* Right — seal + quote leaf */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
              <div className="seal" style={{ width: '180px', height: '180px' }}>
                <span style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>✦</span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                  }}
                >
                  VERIFIED
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 200,
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                    marginTop: '0.25rem',
                  }}
                >
                  On-Chain
                </span>
              </div>

              <div
                className="leaf"
                style={{
                  transform: 'rotate(2deg)',
                  maxWidth: '340px',
                  width: '100%',
                }}
              >
                <div className="leaf-corner" />
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 300,
                    fontSize: '1.1rem',
                    lineHeight: '1.6',
                    color: 'var(--ink-faded)',
                    marginBottom: '1rem',
                  }}
                >
                  &ldquo;The hash does not lie. It cannot be coerced, bribed, or convinced.
                  It merely computes.&rdquo;
                </p>
                <p className="label" style={{ fontSize: '0.65rem' }}>— The Édiproof Registrar</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ROW ─────────────────────────────────────── */}
      <section>
        <div className="container" style={{ padding: 0 }}>
          <div className="stats-row">
            <div className="stat-cell">
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>Certificates Impressed</p>
              <div className="stat-value">{stats.totalIssued}</div>
            </div>
            <div className="stat-cell">
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>Approved Institutions</p>
              <div className="stat-value">{stats.institutionCount}</div>
            </div>
            <div className="stat-cell">
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>Public Verifications</p>
              <div className="stat-value">{stats.totalVerified}</div>
            </div>
            <div className="stat-cell" style={{ borderRight: 'none' }}>
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>Forgeries Rebuffed</p>
              <div className="stat-value">{stats.forgeryCount}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────── */}
      <section style={{ padding: '5rem 0', borderBottom: '1px solid var(--ink)' }}>
        <div className="container">
          <p className="label" style={{ textAlign: 'center', marginBottom: '3rem', color: 'var(--brass)' }}>
            How it works
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
            <div className="leaf">
              <div className="leaf-corner" />
              <p
                className="label"
                style={{ fontSize: '0.65rem', color: 'var(--brass)', marginBottom: '0.75rem' }}
              >
                Act the First
              </p>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 300,
                  fontSize: '1.4rem',
                  marginBottom: '1rem',
                }}
              >
                The Institution{' '}
                <em style={{ color: 'var(--oxblood)' }}>attests</em>
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.7' }}>
                A whitelisted institution uploads the student's certificate PDF to IPFS and
                calls <span className="mono" style={{ fontSize: '0.8rem' }}>issueCertificate()</span>.
                The contract mints a Soulbound Token, bound immutably to the student's wallet.
              </p>
            </div>

            <div className="leaf">
              <div className="leaf-corner" />
              <p
                className="label"
                style={{ fontSize: '0.65rem', color: 'var(--brass)', marginBottom: '0.75rem' }}
              >
                Act the Second
              </p>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 300,
                  fontSize: '1.4rem',
                  marginBottom: '1rem',
                }}
              >
                The Chain{' '}
                <em style={{ color: 'var(--oxblood)' }}>witnesses</em>
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.7' }}>
                The contract computes{' '}
                <span className="mono" style={{ fontSize: '0.8rem' }}>keccak256(name, course, institution, ipfsURI)</span>{' '}
                and stores it on-chain. Any tampering with these fields will produce a different
                hash — making forgery cryptographically detectable.
              </p>
            </div>

            <div className="leaf">
              <div className="leaf-corner" />
              <p
                className="label"
                style={{ fontSize: '0.65rem', color: 'var(--brass)', marginBottom: '0.75rem' }}
              >
                Act the Third
              </p>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 300,
                  fontSize: '1.4rem',
                  marginBottom: '1rem',
                }}
              >
                The Student{' '}
                <em style={{ color: 'var(--oxblood)' }}>holds</em>
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.7' }}>
                The certificate lives in the student's wallet forever. It cannot be transferred
                or sold. Verifiers — employers, other institutions — can check its authenticity
                without any account, registration, or trust in a middleman.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── RECENT IMPRESSIONS ────────────────────────────── */}
      <section style={{ padding: '5rem 0', borderBottom: '1px solid var(--ink)' }}>
        <div className="container">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '2rem',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 300,
                fontStyle: 'italic',
                fontSize: '1.75rem',
              }}
            >
              Recent Impressions
            </h2>
            <Link href="/verify" className="label" style={{ fontSize: '0.65rem', color: 'var(--oxblood)' }}>
              Verify any →
            </Link>
          </div>

          {activity.length === 0 ? (
            <p style={{ color: 'var(--ink-faded)', fontStyle: 'italic' }}>
              No recent activity. The ledger is waiting.
            </p>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Actor</th>
                  <th>Institution</th>
                  <th>Event</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item, idx) => (
                  <tr key={idx}>
                    <td className="mono" style={{ color: 'var(--ink-faded)' }}>
                      {item.tokenId ? `#${item.tokenId}` : '—'}
                    </td>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>
                      {item.actor === 'anonymous' ? (
                        <span style={{ color: 'var(--ink-light)', fontStyle: 'italic' }}>anonymous</span>
                      ) : (
                        truncateAddress(item.actor)
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{item.institution || '—'}</td>
                    <td>
                      <span
                        className="label"
                        style={{
                          fontSize: '0.65rem',
                          color: kindColor[item.kind] || 'var(--ink-faded)',
                        }}
                      >
                        {kindLabel[item.kind] || item.kind}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--ink-light)' }}>
                      {timeAgo(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── EDITOR'S NOTE ─────────────────────────────────── */}
      <section style={{ padding: '5rem 0', borderBottom: '1px solid var(--ink)' }}>
        <div className="container">
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <p className="label" style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--brass)' }}>
              A note from the registrar
            </p>
            <p
              className="drop-cap"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1.05rem',
                lineHeight: '1.8',
                color: 'var(--ink-faded)',
              }}
            >
              Why a chain? Because paper lies. Institutions close, registrars retire, databases
              are breached, and records are altered. The blockchain offers something radical: a
              ledger that no single party controls, that no nation can erase, and that any person
              on earth can read at any moment without asking permission. When a student holds a
              certificate as a Soulbound Token, they hold cryptographic proof — not a promise, not
              a database record, but mathematics. The hash either matches or it does not. There is
              no appeal to authority, no phone call to verify, no waiting for a PDF that may or
              may not be real. The chain says yes, or the chain says no.
            </p>
          </div>
        </div>
      </section>

      {/* ── ACTIVITY STRIP ────────────────────────────────── */}
      <ActivityStrip label="Live from the chain" />
    </>
  )
}
