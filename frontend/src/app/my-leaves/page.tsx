'use client'

import { useEffect, useState } from 'react'
import WalletGate from '@/components/WalletGate'
import ActivityStrip from '@/components/ActivityStrip'
import { useWallet } from '@/hooks/useWallet'
import { useContract } from '@/hooks/useContract'
import { timeAgo, truncateAddress } from '@/lib/hash'

interface CertData {
  studentName: string
  courseName: string
  institution: string
  ipfsURI: string
  certHash: string
  issuedAt: bigint
  revoked: boolean
  reissuedFrom: bigint
  issuer: string
}

interface CertItem {
  id: bigint
  data: CertData
  replacedBy: bigint
}

type Filter = 'all' | 'active' | 'revoked' | 'reissued'

export default function MyLeavesPage() {
  return (
    <WalletGate>
      <MyLeavesContent />
    </WalletGate>
  )
}

function MyLeavesContent() {
  const { address } = useWallet()
  const { readContract } = useContract()

  const [certs, setCerts] = useState<CertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    if (!address) return
    setLoading(true)
    readContract.getCertificatesByOwner(address)
      .then(async (tokenIds: bigint[]) => {
        const results = await Promise.all(
          tokenIds.map(async (id: bigint) => {
            const data = await readContract.getCertificate(id)
            let replacedBy = 0n
            try {
              replacedBy = await readContract.replacedBy(id)
            } catch {
              replacedBy = 0n
            }
            return { id, data, replacedBy }
          })
        )
        setCerts(results)
      })
      .catch(() => setCerts([]))
      .finally(() => setLoading(false))
  }, [address, readContract])

  const total = certs.length
  const active = certs.filter((c) => !c.data.revoked && c.replacedBy === 0n).length
  const revoked = certs.filter((c) => c.data.revoked).length
  const reissued = certs.filter((c) => !c.data.revoked && c.replacedBy > 0n).length

  const filtered = certs.filter((c) => {
    if (filter === 'active') return !c.data.revoked && c.replacedBy === 0n
    if (filter === 'revoked') return c.data.revoked
    if (filter === 'reissued') return !c.data.revoked && c.replacedBy > 0n
    return true
  })

  return (
    <div style={{ padding: '4rem 0' }}>
      <div className="container">
        {/* Page head */}
        <div style={{ marginBottom: '3rem', borderBottom: '1px solid var(--ink)', paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.5rem' }}>
            <span className="section-numeral">III.</span>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 300,
                fontStyle: 'italic',
                fontSize: '2.5rem',
              }}
            >
              Your <em style={{ color: 'var(--oxblood)' }}>collection</em>
            </h1>
          </div>
          {address && (
            <p style={{ color: 'var(--ink-faded)', fontSize: '0.9rem' }}>
              Certificates bound to{' '}
              <span className="mono" style={{ fontSize: '0.85rem' }}>{truncateAddress(address, 10, 6)}</span>
            </p>
          )}
        </div>

        {/* Summary stats */}
        <div style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--ink)' }}>
          <div className="stats-row">
            <div className="stat-cell">
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>Total Held</p>
              <div className="stat-value">{total}</div>
            </div>
            <div className="stat-cell">
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', color: 'var(--moss)' }}>Active</p>
              <div className="stat-value" style={{ color: 'var(--moss)' }}>{active}</div>
            </div>
            <div className="stat-cell">
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', color: 'var(--error)' }}>Revoked</p>
              <div className="stat-value" style={{ color: 'var(--error)' }}>{revoked}</div>
            </div>
            <div className="stat-cell" style={{ borderRight: 'none' }}>
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', color: 'var(--brass)' }}>Reissued</p>
              <div className="stat-value" style={{ color: 'var(--brass)' }}>{reissued}</div>
            </div>
          </div>
        </div>

        {/* Filter toggle */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="toggle-group">
            <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
            <button type="button" className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Active</button>
            <button type="button" className={filter === 'revoked' ? 'active' : ''} onClick={() => setFilter('revoked')}>Revoked</button>
            <button type="button" className={filter === 'reissued' ? 'active' : ''} onClick={() => setFilter('reissued')}>Reissued</button>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--ink-light)' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.25rem' }}>
              Consulting the chain…
            </p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--ink-light)' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              {filter === 'all' ? 'No certificates found' : `No ${filter} certificates`}
            </p>
            <p style={{ fontSize: '0.875rem' }}>
              {filter === 'all'
                ? 'This wallet holds no certificates on the Sepolia ledger.'
                : `Switch to "All" to see other certificates.`}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', marginBottom: '4rem' }}>
            {filtered.map(({ id, data, replacedBy }) => (
              <CertCard key={id.toString()} id={id} data={data} replacedBy={replacedBy} />
            ))}
          </div>
        )}

        {/* Soulbinding note */}
        <div
          style={{
            marginTop: '2rem',
            padding: '1.5rem',
            borderLeft: '2px solid var(--brass)',
            background: 'rgba(138, 109, 59, 0.06)',
            maxWidth: '600px',
          }}
        >
          <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', color: 'var(--brass)' }}>
            On soulbinding
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-faded)', lineHeight: '1.7' }}>
            These certificates are Soulbound Tokens. They cannot be sold, gifted, or transferred
            to another wallet. They are as permanent as the blockchain itself — which is to say,
            effectively permanent. If you lose access to this wallet, the certificates remain
            in it, inaccessible.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '4rem' }}>
        <ActivityStrip label="Your wallet's history" />
      </div>
    </div>
  )
}

function CertCard({ id, data, replacedBy }: { id: bigint; data: CertData; replacedBy: bigint }) {
  const isRevoked = data.revoked
  const isReissued = !isRevoked && replacedBy > 0n
  const isSuperseded = replacedBy > 0n

  const statusPill = isRevoked
    ? <span className="pill-revoked">Revoked</span>
    : isReissued
    ? <span className="pill-reissued">Reissued</span>
    : <span className="pill-active">Active</span>

  const etherscanUrl = `https://sepolia.etherscan.io/token/0x14Cf79F1ef984db755f0803E215FB12038Ad64d5?a=${id.toString()}`
  const ipfsGatewayUrl = data.ipfsURI
    ? `https://gateway.pinata.cloud/ipfs/${data.ipfsURI.replace('ipfs://', '')}`
    : null

  return (
    <div className="leaf" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Brass banner for superseded */}
      {isSuperseded && (
        <div className="brass-banner" style={{ margin: '-2rem -2rem 1.5rem', width: 'calc(100% + 4rem)' }}>
          — reissued in place by #{replacedBy.toString()} —
        </div>
      )}

      <div className="leaf-corner" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        {statusPill}
        <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-light)' }}>#{id.toString()}</p>
      </div>

      {/* Main cert info */}
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          color: 'var(--oxblood)',
          fontSize: '0.8rem',
          marginBottom: '0.25rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {data.courseName}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 300,
          fontSize: '1.35rem',
          marginBottom: '0.5rem',
          lineHeight: '1.2',
        }}
      >
        {data.studentName}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faded)', marginBottom: '1rem' }}>
        {data.institution}
      </p>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
          <span className="label" style={{ fontSize: '0.6rem' }}>Impressed</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-faded)' }}>
            {new Date(Number(data.issuedAt) * 1000).toLocaleDateString()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
          <span className="label" style={{ fontSize: '0.6rem' }}>Issuer</span>
          <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-faded)' }}>
            {truncateAddress(data.issuer)}
          </span>
        </div>
        {data.reissuedFrom > 0n && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
            <span className="label" style={{ fontSize: '0.6rem' }}>Reissued from</span>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--brass)' }}>
              #{data.reissuedFrom.toString()}
            </span>
          </div>
        )}
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {ipfsGatewayUrl && (
          <a
            href={ipfsGatewayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="label"
            style={{ fontSize: '0.65rem', color: 'var(--oxblood)' }}
          >
            Open PDF →
          </a>
        )}
        <a
          href={etherscanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="label"
          style={{ fontSize: '0.65rem', color: 'var(--ink-faded)' }}
        >
          Etherscan →
        </a>
        <button
          type="button"
          className="label"
          style={{
            fontSize: '0.65rem',
            color: 'var(--ink-faded)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          onClick={() => {
            const url = `${window.location.origin}/verify?tokenId=${id.toString()}`
            navigator.clipboard.writeText(url).catch(() => {})
          }}
        >
          Copy share link
        </button>
      </div>

      {/* Revoked stamp overlay */}
      {isRevoked && (
        <div className="revoked-stamp">REVOKED</div>
      )}
    </div>
  )
}
