'use client'

import { useState } from 'react'
import { useContract } from '@/hooks/useContract'
import { computeCertHash, timeAgo, truncateAddress } from '@/lib/hash'
import { logEvent } from '@/lib/api'

type Tab = 'details' | 'token' | 'wallet'

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

interface VerifyResult {
  valid: boolean
  tokenId: bigint
  ownerAddr: string
  revoked: boolean
  replacedByTokenId: bigint
  cert?: CertData
}

const GLOSSARY = [
  {
    term: 'Soulbound Token',
    def: 'An ERC-721 NFT that cannot be transferred. Once minted to a wallet, it stays there permanently — like a soul, it cannot be traded.',
  },
  {
    term: 'IPFS',
    def: 'InterPlanetary File System. A distributed file storage protocol where files are addressed by their content hash, not a URL.',
  },
  {
    term: 'keccak256',
    def: "Ethereum's primary hash function. Given the same inputs, it always produces the same 32-byte output. Any change to inputs produces a completely different hash.",
  },
  {
    term: 'Sepolia',
    def: "Ethereum's proof-of-stake testnet. Identical to mainnet in behavior, but uses valueless test ETH. Ediproof is deployed here for demonstration.",
  },
  {
    term: 'Revocation',
    def: 'An institution can burn a certificate token, rendering it invalid. The event is recorded on-chain permanently.',
  },
  {
    term: 'Reissue',
    def: 'A correction mechanism: the old token is burned and a new one minted. The new certificate records the old token ID in its reissuedFrom field.',
  },
]

export default function VerifyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const { readContract } = useContract()

  return (
    <div style={{ padding: '4rem 0' }}>
      <div className="container">
        {/* Page head */}
        <div style={{ marginBottom: '3rem', borderBottom: '1px solid var(--ink)', paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.5rem' }}>
            <span className="section-numeral">II.</span>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 300,
                fontStyle: 'italic',
                fontSize: '2.5rem',
              }}
            >
              Interrogate the <em style={{ color: 'var(--oxblood)' }}>ledger</em>
            </h1>
          </div>
          <p style={{ color: 'var(--ink-faded)', fontSize: '0.95rem' }}>
            Verify any certificate on the Sepolia ledger.{' '}
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: 'var(--moss)',
                border: '1px solid var(--moss)',
                padding: '2px 0.5rem',
                marginLeft: '0.5rem',
              }}
            >
              No wallet required
            </span>
          </p>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: '3rem' }}>
          <button
            className={activeTab === 'details' ? 'active' : ''}
            onClick={() => setActiveTab('details')}
          >
            By Details
          </button>
          <button
            className={activeTab === 'token' ? 'active' : ''}
            onClick={() => setActiveTab('token')}
          >
            By Token №
          </button>
          <button
            className={activeTab === 'wallet' ? 'active' : ''}
            onClick={() => setActiveTab('wallet')}
          >
            By Wallet
          </button>
        </div>

        {activeTab === 'details' && (
          <ByDetailsTab readContract={readContract} />
        )}
        {activeTab === 'token' && (
          <ByTokenTab readContract={readContract} />
        )}
        {activeTab === 'wallet' && (
          <ByWalletTab readContract={readContract} />
        )}

        {/* Glossary */}
        <section style={{ marginTop: '5rem', paddingTop: '3rem', borderTop: '1px solid var(--ink)' }}>
          <p className="label" style={{ marginBottom: '2rem', color: 'var(--brass)' }}>Glossary</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {GLOSSARY.map(({ term, def }) => (
              <div key={term}>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    color: 'var(--ink)',
                    marginBottom: '0.5rem',
                  }}
                >
                  {term}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
                  {def}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ── By Details Tab ────────────────────────────────── */
function ByDetailsTab({ readContract }: { readContract: ReturnType<typeof useContract>['readContract'] }) {
  const [name, setName] = useState('')
  const [course, setCourse] = useState('')
  const [institution, setInstitution] = useState('')
  const [ipfsURI, setIpfsURI] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const liveHash = computeCertHash(name, course, institution, ipfsURI)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await readContract.verifyCertificate(name, course, institution, ipfsURI)
      const [valid, tokenId, ownerAddr, revoked, replacedByTokenId] = res

      let cert: CertData | undefined
      if (valid) {
        cert = await readContract.getCertificate(tokenId)
      }

      const verifyResult: VerifyResult = { valid, tokenId, ownerAddr, revoked, replacedByTokenId, cert }
      setResult(verifyResult)

      if (valid) {
        await logEvent({
          kind: 'verified',
          tokenId: Number(tokenId),
          actor: 'anonymous',
          institution,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed — check your network and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }}>
      <div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '2rem' }}>
            <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Student Name</label>
            <input className="field-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Exact name on certificate" required />
          </div>
          <div style={{ marginBottom: '2rem' }}>
            <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Course</label>
            <input className="field-input" type="text" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. Computer Science" required />
          </div>
          <div style={{ marginBottom: '2rem' }}>
            <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Institution</label>
            <input className="field-input" type="text" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. MIT" required />
          </div>
          <div style={{ marginBottom: '2rem' }}>
            <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>IPFS URI</label>
            <input className="field-input mono" type="text" value={ipfsURI} onChange={(e) => setIpfsURI(e.target.value)} placeholder="ipfs://Qm…" required />
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <p className="label" style={{ marginBottom: '0.5rem' }}>Certificate Hash (live)</p>
            <div className="hash-box">{liveHash}</div>
          </div>

          <button type="submit" className="btn btn-oxblood" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Querying the chain…' : 'Interrogate the ledger →'}
          </button>
        </form>
      </div>

      {/* Result */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {error !== null && (
          <div style={{ textAlign: 'center', color: 'var(--error)', border: '1px dashed var(--error)', padding: '1.5rem', maxWidth: '32rem' }}>
            <p className="label" style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>Lookup failed</p>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1rem' }}>{error}</p>
          </div>
        )}
        {error === null && result === null && (
          <div style={{ textAlign: 'center', color: 'var(--ink-light)' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              Enter certificate details
            </p>
            <p style={{ fontSize: '0.875rem' }}>The ledger will render its verdict.</p>
          </div>
        )}
        {error === null && result !== null && (
          <VerifyResultCard result={result} />
        )}
      </div>
    </div>
  )
}

function VerifyResultCard({ result }: { result: VerifyResult }) {
  if (!result.valid) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="seal-fail" style={{ width: '180px', height: '180px', margin: '0 auto 2rem' }}>
          <span style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>✗</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            NO MATCH
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '0.65rem', marginTop: '0.25rem' }}>
            On Chain
          </span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.5rem', color: 'var(--error)', marginBottom: '0.5rem' }}>
          No match on chain
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-faded)' }}>
          This combination of fields does not match any certificate in the ledger.
          The certificate may be forged, or the details may be incorrect.
        </p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '2rem' }}>
        <div className="seal" style={{ width: '120px', height: '120px', flexShrink: 0 }}>
          <span style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>✓</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            VERIFIED
          </span>
        </div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1.75rem', color: 'var(--moss)', marginBottom: '0.25rem' }}>
            Verified on chain
          </h2>
          <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-light)' }}>
            Token #{result.tokenId.toString()}
          </p>
        </div>
      </div>

      {result.revoked && (
        <div style={{ background: 'rgba(160, 55, 46, 0.1)', border: '1px solid var(--error)', padding: '0.75rem 1rem', marginBottom: '1.5rem' }}>
          <p className="label" style={{ color: 'var(--error)', fontSize: '0.65rem' }}>
            Warning: This certificate has been revoked
          </p>
        </div>
      )}

      {result.cert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <DetailRow label="Student" value={result.cert.studentName} />
          <DetailRow label="Course" value={result.cert.courseName} />
          <DetailRow label="Institution" value={result.cert.institution} />
          <DetailRow label="Issued" value={new Date(Number(result.cert.issuedAt) * 1000).toLocaleDateString()} />
          <DetailRow label="Issued by" value={truncateAddress(result.cert.issuer)} mono />
          <DetailRow label="Owner" value={truncateAddress(result.ownerAddr)} mono />
          {result.cert.reissuedFrom > 0n && (
            <DetailRow label="Reissued from" value={`Token #${result.cert.reissuedFrom.toString()}`} mono />
          )}
          {result.replacedByTokenId > 0n && (
            <DetailRow label="Replaced by" value={`Token #${result.replacedByTokenId.toString()}`} mono />
          )}
          {result.cert.ipfsURI && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.5rem 0', borderBottom: '1px solid var(--vellum-3)' }}>
              <span className="label" style={{ fontSize: '0.65rem' }}>PDF</span>
              <a href={`https://gateway.pinata.cloud/ipfs/${result.cert.ipfsURI.replace('ipfs://', '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--oxblood)' }}>
                Open document →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.5rem 0', borderBottom: '1px solid var(--vellum-3)' }}>
      <span className="label" style={{ fontSize: '0.65rem' }}>{label}</span>
      <span className={mono ? 'mono' : undefined} style={{ fontSize: '0.875rem' }}>{value}</span>
    </div>
  )
}

/* ── By Token Tab ──────────────────────────────────── */
function ByTokenTab({ readContract }: { readContract: ReturnType<typeof useContract>['readContract'] }) {
  const [tokenId, setTokenId] = useState('')
  const [loading, setLoading] = useState(false)
  const [cert, setCert] = useState<CertData | null>(null)
  const [owner, setOwner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setCert(null)
    setOwner(null)
    setError(null)
    try {
      const certData = await readContract.getCertificate(parseInt(tokenId))
      setCert(certData)
      try {
        const ownerAddr = await readContract.ownerOf(parseInt(tokenId))
        setOwner(ownerAddr)
      } catch {
        setOwner(null)
      }
    } catch {
      setError('Token not found or could not be fetched.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <form onSubmit={handleSubmit} style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Token ID</label>
          <input
            className="field-input mono"
            type="number"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            placeholder="e.g. 1"
            required
            min="1"
          />
        </div>
        <button type="submit" className="btn btn-oxblood" disabled={loading}>
          {loading ? 'Fetching from chain…' : 'Fetch certificate →'}
        </button>
      </form>

      {error && (
        <div style={{ background: 'rgba(160, 55, 46, 0.1)', border: '1px solid var(--error)', padding: '1rem' }}>
          <p className="label" style={{ color: 'var(--error)', fontSize: '0.65rem' }}>{error}</p>
        </div>
      )}

      {cert && (
        <div className="leaf">
          <div className="leaf-corner" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem', color: 'var(--brass)' }}>Certificate</p>
              <p className="mono" style={{ fontSize: '0.8rem' }}>#{tokenId}</p>
            </div>
            <span className={cert.revoked ? 'pill-revoked' : 'pill-active'}>
              {cert.revoked ? 'Revoked' : 'Active'}
            </span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
            {cert.studentName}
          </h2>
          <p style={{ color: 'var(--oxblood)', fontStyle: 'italic', marginBottom: '1.5rem' }}>{cert.courseName}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <DetailRow label="Institution" value={cert.institution} />
            <DetailRow label="Issued" value={new Date(Number(cert.issuedAt) * 1000).toLocaleDateString()} />
            <DetailRow label="Issuer" value={truncateAddress(cert.issuer)} mono />
            {owner && <DetailRow label="Current Owner" value={truncateAddress(owner)} mono />}
            {cert.reissuedFrom > 0n && (
              <DetailRow label="Reissued from" value={`Token #${cert.reissuedFrom.toString()}`} mono />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── By Wallet Tab ─────────────────────────────────── */
function ByWalletTab({ readContract }: { readContract: ReturnType<typeof useContract>['readContract'] }) {
  const [walletAddr, setWalletAddr] = useState('')
  const [loading, setLoading] = useState(false)
  const [certs, setCerts] = useState<Array<{ id: bigint; data: CertData }>>([])
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setCerts([])
    setError(null)
    try {
      const tokenIds: bigint[] = await readContract.getCertificatesByOwner(walletAddr)
      const results = await Promise.all(
        tokenIds.map(async (id) => {
          const data = await readContract.getCertificate(id)
          return { id, data }
        })
      )
      setCerts(results)
    } catch {
      setError('Could not fetch certificates for this address.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: '3rem', maxWidth: '600px' }}>
        <div style={{ marginBottom: '2rem' }}>
          <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>Ethereum Address</label>
          <input
            className="field-input mono"
            type="text"
            value={walletAddr}
            onChange={(e) => setWalletAddr(e.target.value)}
            placeholder="0x…"
            required
          />
        </div>
        <button type="submit" className="btn btn-oxblood" disabled={loading}>
          {loading ? 'Querying the chain…' : 'Fetch collection →'}
        </button>
      </form>

      {error && (
        <div style={{ background: 'rgba(160, 55, 46, 0.1)', border: '1px solid var(--error)', padding: '1rem', maxWidth: '600px', marginBottom: '2rem' }}>
          <p className="label" style={{ color: 'var(--error)', fontSize: '0.65rem' }}>{error}</p>
        </div>
      )}

      {!loading && certs.length === 0 && walletAddr && !error && (
        <p style={{ color: 'var(--ink-faded)', fontStyle: 'italic', fontSize: '0.9rem' }}>
          No certificates found for this address.
        </p>
      )}

      {certs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem' }}>
          {certs.map(({ id, data }) => (
            <div key={id.toString()} className="leaf" style={{ position: 'relative' }}>
              <div className="leaf-corner" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-light)' }}>#{id.toString()}</p>
                <span className={data.revoked ? 'pill-revoked' : data.reissuedFrom > 0n ? 'pill-reissued' : 'pill-active'}>
                  {data.revoked ? 'Revoked' : data.reissuedFrom > 0n ? 'Reissued' : 'Active'}
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                {data.studentName}
              </p>
              <p style={{ color: 'var(--oxblood)', fontStyle: 'italic', fontSize: '0.9rem', marginBottom: '1rem' }}>
                {data.courseName}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-faded)', marginBottom: '0.5rem' }}>{data.institution}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)' }}>
                {timeAgo(new Date(Number(data.issuedAt) * 1000).toISOString())}
              </p>

              {data.revoked && (
                <div className="revoked-stamp">REVOKED</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
