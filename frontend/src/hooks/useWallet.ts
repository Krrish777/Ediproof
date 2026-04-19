'use client'

import { useState, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

export interface WalletState {
  address: string | null
  chainId: number | null
  isConnecting: boolean
  error: string | null
  connect: () => Promise<void>
}

const SEPOLIA_CHAIN_ID = 11155111

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('MetaMask not found. Please install MetaMask.')
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[]

      if (accounts.length > 0) {
        setAddress(accounts[0])
      }

      const chainIdHex = await window.ethereum.request({
        method: 'eth_chainId',
      }) as string

      const id = parseInt(chainIdHex, 16)
      setChainId(id)

      if (id !== SEPOLIA_CHAIN_ID) {
        console.warn(`Connected to chain ${id}, expected Sepolia (${SEPOLIA_CHAIN_ID}). Please switch networks.`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(message)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  useEffect(() => {
    if (!window.ethereum) return

    // Check if already connected
    window.ethereum.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const accs = accounts as string[]
        if (accs.length > 0) {
          setAddress(accs[0])
          return window.ethereum!.request({ method: 'eth_chainId' })
        }
      })
      .then((chainIdHex) => {
        if (chainIdHex) {
          const id = parseInt(chainIdHex as string, 16)
          setChainId(id)
          if (id !== SEPOLIA_CHAIN_ID) {
            console.warn(`Connected to chain ${id}, expected Sepolia (${SEPOLIA_CHAIN_ID}).`)
          }
        }
      })
      .catch(() => {})

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[]
      if (accs.length === 0) {
        setAddress(null)
      } else {
        setAddress(accs[0])
      }
    }

    const handleChainChanged = (chainIdHex: unknown) => {
      const id = parseInt(chainIdHex as string, 16)
      setChainId(id)
      if (id !== SEPOLIA_CHAIN_ID) {
        console.warn(`Switched to chain ${id}, expected Sepolia (${SEPOLIA_CHAIN_ID}).`)
      }
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum?.removeListener('chainChanged', handleChainChanged)
    }
  }, [])

  return { address, chainId, isConnecting, error, connect }
}
