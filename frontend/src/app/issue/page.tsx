'use client'

import { useState, useEffect, useRef } from 'react'
import WalletGate from '@/components/WalletGate'
import { useWallet } from '@/hooks/useWallet'
import { getSignedContract } from '@/hooks/useContract'
import { computeCertHash, truncateAddress } from '@/lib/hash'
import { logEvent, uploadFile, fetchInstitutionStats } from '@/lib/api'

export default function IssuePage() {
  return (
    <WalletGate>
      <IssueForm />
    </WalletGate>
  )
}

function IssueForm() {
  const { address } = useWallet()

  // Toggle: 'issue' | 'reissue'
  const [mode, setMode] = useState<'issue' | 'reissue'>('issue')

  // Form fields
  const [studentAddress, setStudentAddress] = useState('')
  const [studentName, setStudentName] = useState('')
  const [course, setCourse] = useState('')
  const [institution, setInstitution] = useState('')
  const [ipfsURI, setIpfsURI] = useState('')
  const [oldTokenId, setOldTokenId] = useState('')

  // File upload
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadResult, setUploadResult] = useState<{ cid: string; ipfsURI: string; gatewayURL: string } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Tx status
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [newTokenId, setNewTokenId] = useState<string | null>(null)

  // Institution stats
  const [instStats, setInstStats] = useState<{ count: number } | null>(null)

  const liveHash = computeCertHash(studentName, course, institution, ipfsURI)

  useEffect(() => {
    if (address) {
      fetchInstitutionStats(address).then(setInstStats).catch(() => {})
    }
  }, [address])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus('uploading')
    setUploadResult(null)
    setUploadError(null)
    try {
      const result = await uploadFile(file)
      setUploadResult(result)
      setIpfsURI(result.ipfsURI)
      setUploadStatus('done')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploadStatus('error')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTxStatus('pending')
    setTxError(null)
    setTxHash(null)
    setNewTokenId(null)

    try {
      const c = await getSignedContract()
      if (!c) throw new Error('Could not get contract signer')

      if (mode === 'issue') {
        const tx = await c.issueCertificate(studentAddress, studentName, course, institution, ipfsURI)
        setTxHash(tx.hash)
        const receipt = await tx.wait()
        // Extract token ID from event
        const event = receipt?.logs?.find((log: { topics?: string[] }) =>
          log.topics && log.topics[0] === c.interface.getEvent('CertificateIssued')?.topicHash
        )
        const tokenId = event ? c.interface.parseLog(event)?.args?.tokenId?.toString() : null
        setNewTokenId(tokenId)
        setTxStatus('success')

        await logEvent({
          kind: 'issued',
          tokenId: tokenId ? parseInt(tokenId) : undefined,
          txHash: tx.hash,
          actor: address || 'unknown',
          institution,
        })
      } else {
        const tx = await c.reissueCertificate(
          parseInt(oldTokenId),
          studentName,
          course,
          institution,
          ipfsURI,
          studentAddress,
        )
        setTxHash(tx.hash)
        const receipt = await tx.wait()
        const event = receipt?.logs?.find((log: { topics?: string[] }) =>
          log.topics && log.topics[0] === c.interface.getEvent('CertificateReissued')?.topicHash
        )
        const newId = event ? c.interface.parseLog(event)?.args?.newTokenId?.toString() : null
        setNewTokenId(newId)
        setTxStatus('success')

        await logEvent({
          kind: 'reissued',
          tokenId: newId ? parseInt(newId) : undefined,
          txHash: tx.hash,
          actor: address || 'unknown',
          institution,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setTxError(msg.length > 200 ? msg.slice(0, 200) + '…' : msg)
      setTxStatus('error')
    }
  }

  return (
    <div style={{ padding: '4rem 0' }}>
      <div className="container">
        {/* Page head */}
        <div style={{ marginBottom: '3rem', borderBottom: '1px solid var(--ink)', paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.5rem' }}>
            <span className="section-numeral">I.</span>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 300,
                fontStyle: 'italic',
                fontSize: '2.5rem',
              }}
            >
              Impress a new certificate
            </h1>
          </div>
          <p style={{ color: 'var(--ink-faded)', fontSize: '0.95rem' }}>
            Issue a Soulbound Token certificate to a student's wallet on the Sepolia testnet.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ marginBottom: '3rem' }}>
          <p className="label" style={{ marginBottom: '0.75rem' }}>Mode</p>
          <div className="toggle-group">
            <button
              type="button"
              className={mode === 'issue' ? 'active' : ''}
              onClick={() => setMode('issue')}
            >
              Issue New
            </button>
            <button
              type="button"
              className={mode === 'reissue' ? 'active' : ''}
              onClick={() => setMode('reissue')}
            >
              Reissue Existing
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '3rem' }}>
          {/* LEFT — form */}
          <div>
            <form onSubmit={handleSubmit}>
              {/* Reissue: old token ID */}
              {mode === 'reissue' && (
                <div style={{ marginBottom: '2rem' }}>
                  <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Old Token №
                  </label>
                  <input
                    className="field-input mono"
                    type="number"
                    placeholder="e.g. 42"
                    value={oldTokenId}
                    onChange={(e) => setOldTokenId(e.target.value)}
                    required={mode === 'reissue'}
                  />
                </div>
              )}

              <div style={{ marginBottom: '2rem' }}>
                <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Student Wallet Address
                </label>
                <input
                  className="field-input mono"
                  type="text"
                  placeholder="0x…"
                  value={studentAddress}
                  onChange={(e) => setStudentAddress(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Student's Full Name
                </label>
                <input
                  className="field-input"
                  type="text"
                  placeholder="As it appears on the certificate"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Course
                  </label>
                  <input
                    className="field-input"
                    type="text"
                    placeholder="e.g. Computer Science"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Institution
                  </label>
                  <input
                    className="field-input"
                    type="text"
                    placeholder="e.g. MIT"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* File upload */}
              <div style={{ marginBottom: '2rem' }}>
                <label className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>
                  Certificate Document (PDF)
                </label>
                <div
                  className="file-drop"
                  onClick={() => fileRef.current?.click()}
                >
                  {uploadStatus === 'idle' && 'Click to select PDF — will be uploaded to IPFS'}
                  {uploadStatus === 'uploading' && 'Uploading to IPFS via Pinata…'}
                  {uploadStatus === 'done' && uploadResult && (
                    <span>
                      Uploaded ✓ — CID: <span className="mono">{uploadResult.cid.slice(0, 20)}…</span>
                    </span>
                  )}
                  {uploadStatus === 'error' && (
                    <span style={{ color: 'var(--error)', display: 'block', fontSize: '0.85rem', lineHeight: 1.4 }}>
                      Upload failed — {uploadError ?? 'unknown error'}
                    </span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                {uploadResult && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem' }}>IPFS URI</p>
                    <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-faded)', wordBreak: 'break-all' }}>
                      {uploadResult.ipfsURI}
                    </p>
                    <a
                      href={uploadResult.gatewayURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label"
                      style={{ fontSize: '0.65rem', color: 'var(--oxblood)' }}
                    >
                      View on gateway →
                    </a>
                  </div>
                )}
              </div>

              {/* Manual IPFS URI override */}
              <div style={{ marginBottom: '2rem' }}>
                <label className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  IPFS URI (auto-filled from upload, or enter manually)
                </label>
                <input
                  className="field-input mono"
                  type="text"
                  placeholder="ipfs://Qm…"
                  value={ipfsURI}
                  onChange={(e) => setIpfsURI(e.target.value)}
                  required
                />
              </div>

              {/* Live hash preview */}
              <div style={{ marginBottom: '2.5rem' }}>
                <p className="label" style={{ marginBottom: '0.5rem' }}>Live Certificate Hash</p>
                <div className="hash-box">
                  {liveHash}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', marginTop: '0.5rem' }}>
                  Updates live as you type. This exact hash will be stored on-chain.
                </p>
              </div>

              {/* Transaction status */}
              {txStatus === 'success' && (
                <div
                  style={{
                    background: 'rgba(63, 96, 55, 0.1)',
                    border: '1px solid var(--moss)',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <p className="label" style={{ color: 'var(--moss)', marginBottom: '0.5rem', fontSize: '0.7rem' }}>
                    Certificate impressed upon the chain ✓
                  </p>
                  {newTokenId && (
                    <p className="mono" style={{ fontSize: '0.8rem' }}>Token #{newTokenId}</p>
                  )}
                  {txHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: 'var(--oxblood)', display: 'block', marginTop: '0.5rem' }}
                    >
                      View transaction →
                    </a>
                  )}
                </div>
              )}

              {txStatus === 'error' && (
                <div
                  style={{
                    background: 'rgba(160, 55, 46, 0.1)',
                    border: '1px solid var(--error)',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <p className="label" style={{ color: 'var(--error)', fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                    Transaction failed
                  </p>
                  <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{txError}</p>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-oxblood"
                disabled={txStatus === 'pending' || uploadStatus === 'uploading'}
                style={{ width: '100%' }}
              >
                {txStatus === 'pending'
                  ? 'Impressing upon the chain…'
                  : mode === 'issue'
                  ? 'Impress upon the chain →'
                  : 'Reissue upon the chain →'}
              </button>
            </form>
          </div>

          {/* RIGHT — info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="leaf">
              <div className="leaf-corner" />
              <p className="label" style={{ marginBottom: '1rem', color: 'var(--brass)', fontSize: '0.65rem' }}>
                Four rules for the registrar
              </p>
              <ol style={{ listStyle: 'decimal', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
                  <strong>Proofread.</strong> Every character is hashed. A stray comma produces
                  a different certificate.
                </li>
                <li style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
                  <strong>Canonical name.</strong> Use the legal name exactly as it appears
                  on official records.
                </li>
                <li style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
                  <strong>Final PDF.</strong> Upload the signed, official document — not a draft.
                </li>
                <li style={{ fontSize: '0.875rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
                  <strong>Verify wallet.</strong> Confirm the student's address before minting.
                  Soulbound tokens cannot be transferred.
                </li>
              </ol>
            </div>

            {/* Marginalia about reissue */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderLeft: '2px solid var(--brass)',
                background: 'rgba(138, 109, 59, 0.06)',
              }}
            >
              <p className="label" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', color: 'var(--brass)' }}>
                On Reissue
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
                Reissuing burns the old token and mints a new one. The old token ID is recorded
                in the new certificate's <span className="mono" style={{ fontSize: '0.75rem' }}>reissuedFrom</span> field.
                Use reissue only for corrections — not for new certificates.
              </p>
            </div>

            {/* Institution info */}
            {address && (
              <div className="leaf">
                <div className="leaf-corner" />
                <p className="label" style={{ fontSize: '0.65rem', marginBottom: '1rem', color: 'var(--brass)' }}>
                  Your Institution
                </p>
                <div style={{ marginBottom: '1rem' }}>
                  <p className="label" style={{ fontSize: '0.6rem', marginBottom: '0.25rem' }}>Connected Wallet</p>
                  <p className="mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                    {truncateAddress(address, 10, 6)}
                  </p>
                </div>
                {instStats !== null && (
                  <div>
                    <p className="label" style={{ fontSize: '0.6rem', marginBottom: '0.25rem' }}>Certificates Issued</p>
                    <p
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 200,
                        fontStyle: 'italic',
                        fontSize: '2.5rem',
                        lineHeight: 1,
                      }}
                    >
                      {instStats.count}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
