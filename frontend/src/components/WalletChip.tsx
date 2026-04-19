'use client'

import { useWallet } from '@/hooks/useWallet'
import { truncateAddress } from '@/lib/hash'

const SEPOLIA_CHAIN_ID = 11155111

export default function WalletChip() {
  const { address, chainId, isConnecting, connect } = useWallet()

  if (!address) {
    return (
      <button
        className="btn"
        onClick={connect}
        disabled={isConnecting}
        style={{ padding: '0.5rem 1.25rem', fontSize: '0.7rem' }}
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    )
  }

  const isWrongNetwork = chainId !== null && chainId !== SEPOLIA_CHAIN_ID

  if (isWrongNetwork) {
    return (
      <div className="wallet-chip">
        <span className="wallet-dot wallet-dot-orange" />
        <span style={{ color: 'var(--brass-light)' }}>Wrong network</span>
      </div>
    )
  }

  return (
    <div className="wallet-chip">
      <span className="wallet-dot wallet-dot-green" />
      <span className="mono">{truncateAddress(address)}</span>
      <span
        style={{
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--moss)',
          borderLeft: '1px solid var(--ink)',
          paddingLeft: '0.5rem',
          marginLeft: '0.25rem',
        }}
      >
        Sepolia
      </span>
    </div>
  )
}
