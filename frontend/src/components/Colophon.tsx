import Link from 'next/link'

const CONTRACT_ADDRESS = '0x14Cf79F1ef984db755f0803E215FB12038Ad64d5'
const ETHERSCAN_URL = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`

export default function Colophon() {
  return (
    <footer style={{ padding: '0 0 4rem', marginTop: '4rem' }}>
      <div className="container">
        <div className="colophon">
          {/* Brand column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1rem' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1.5rem',
                  color: 'var(--ink)',
                }}
              >
                ÉDI
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  fontSize: '1.5rem',
                  color: 'var(--oxblood)',
                }}
              >
                proof
              </span>
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--ink-faded)',
                lineHeight: '1.7',
                marginBottom: '1.5rem',
                maxWidth: '300px',
              }}
            >
              A blockchain-based academic certificate verification system. Certificates are
              issued as Soulbound Tokens, permanently bound to a student&apos;s wallet.
            </p>
            <p className="label" style={{ marginBottom: '0.5rem' }}>Contract</p>
            <a
              href={ETHERSCAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{ fontSize: '0.7rem', color: 'var(--oxblood)', wordBreak: 'break-all' }}
            >
              {CONTRACT_ADDRESS}
            </a>
          </div>

          {/* Navigation */}
          <div>
            <p className="label" style={{ marginBottom: '1rem' }}>Navigate</p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/issue" style={{ fontSize: '0.875rem', color: 'var(--ink-faded)' }}>Issue Certificate</Link>
              <Link href="/verify" style={{ fontSize: '0.875rem', color: 'var(--ink-faded)' }}>Verify Certificate</Link>
              <Link href="/my-leaves" style={{ fontSize: '0.875rem', color: 'var(--ink-faded)' }}>My Leaves</Link>
            </nav>
          </div>

          {/* Resources */}
          <div>
            <p className="label" style={{ marginBottom: '1rem' }}>Resources</p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <a
                href={ETHERSCAN_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--ink-faded)' }}
              >
                Etherscan
              </a>
              <a
                href="https://sepoliafaucet.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--ink-faded)' }}
              >
                Sepolia Faucet
              </a>
            </nav>
          </div>

          {/* Network */}
          <div>
            <p className="label" style={{ marginBottom: '1rem' }}>Network</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--moss)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-faded)' }}>Sepolia Testnet</span>
              </div>
              <p className="mono" style={{ fontSize: '0.7rem', color: 'var(--ink-light)' }}>Chain ID: 11155111</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', marginTop: '0.5rem', lineHeight: '1.5' }}>
                ERC-721 Soulbound Token
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '3rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--vellum-3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p className="label" style={{ fontSize: '0.65rem' }}>
            &copy; 2026 Édiproof — For demonstration purposes only
          </p>
          <p className="label" style={{ fontSize: '0.65rem' }}>
            Built on Ethereum · Sepolia Testnet
          </p>
        </div>
      </div>
    </footer>
  )
}
