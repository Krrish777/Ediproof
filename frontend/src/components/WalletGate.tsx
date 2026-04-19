'use client'

import { useWallet } from '@/hooks/useWallet'

const SEPOLIA_CHAIN_ID = 11155111

interface WalletGateProps {
  children: React.ReactNode
}

export default function WalletGate({ children }: WalletGateProps) {
  const { address, chainId, isConnecting, connect } = useWallet()

  if (!address) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          padding: '2rem',
        }}
      >
        <div className="leaf" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div className="leaf-corner" />
          <p
            className="label"
            style={{ marginBottom: '1rem', color: 'var(--brass)' }}
          >
            Wallet Required
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 300,
              fontStyle: 'italic',
              fontSize: '1.75rem',
              marginBottom: '1rem',
            }}
          >
            Connect your wallet to continue
          </h2>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--ink-faded)',
              marginBottom: '2rem',
              lineHeight: '1.6',
            }}
          >
            This page requires a MetaMask wallet connected to the Sepolia testnet.
          </p>
          <button
            className="btn btn-oxblood"
            onClick={connect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        </div>
      </div>
    )
  }

  if (chainId !== null && chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          padding: '2rem',
        }}
      >
        <div className="leaf" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div className="leaf-corner" />
          <p
            className="label"
            style={{ marginBottom: '1rem', color: 'var(--brass-light)' }}
          >
            Wrong Network
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 300,
              fontStyle: 'italic',
              fontSize: '1.75rem',
              marginBottom: '1rem',
            }}
          >
            Please switch to Sepolia testnet
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-faded)', lineHeight: '1.6' }}>
            Ediproof operates on the Ethereum Sepolia testnet (Chain ID: 11155111).
            Please switch your wallet network to continue.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
