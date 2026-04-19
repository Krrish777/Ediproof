'use client'

import { useState, useEffect, useCallback } from 'react'
import { getMetaMaskProvider, type EIP1193Provider } from '@/lib/wallet'

export interface WalletState {
  address: string | null
  chainId: number | null
  isConnecting: boolean
  error: string | null
  connect: () => Promise<void>
}

const SEPOLIA_CHAIN_ID = 11155111

async function switchToSepolia(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xaa36a7' }],
    })
  } catch (err: unknown) {
    const errCode = (err as { code?: number })?.code
    if (errCode === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0xaa36a7',
          chainName: 'Sepolia',
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      })
    } else {
      throw err
    }
  }
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    const provider = getMetaMaskProvider()
    if (!provider) {
      setError('MetaMask not found. Please install the MetaMask browser extension from metamask.io and refresh this page.')
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      }) as string[]

      if (accounts.length > 0) setAddress(accounts[0])

      const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string
      const id = parseInt(chainIdHex, 16)
      setChainId(id)

      if (id !== SEPOLIA_CHAIN_ID) {
        try {
          await switchToSepolia(provider)
          const newChainHex = await provider.request({ method: 'eth_chainId' }) as string
          setChainId(parseInt(newChainHex, 16))
        } catch {
          setError('Please switch MetaMask to the Sepolia testnet to continue.')
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(message)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  useEffect(() => {
    const provider = getMetaMaskProvider()
    if (!provider) return

    provider.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const accs = accounts as string[]
        if (accs.length > 0) {
          setAddress(accs[0])
          return provider.request({ method: 'eth_chainId' })
        }
      })
      .then((chainIdHex) => {
        if (chainIdHex) {
          const id = parseInt(chainIdHex as string, 16)
          setChainId(id)
        }
      })
      .catch(() => {})

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[]
      setAddress(accs.length === 0 ? null : accs[0])
    }

    const handleChainChanged = (chainIdHex: unknown) => {
      setChainId(parseInt(chainIdHex as string, 16))
    }

    provider.on('accountsChanged', handleAccountsChanged)
    provider.on('chainChanged', handleChainChanged)

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged)
      provider.removeListener('chainChanged', handleChainChanged)
    }
  }, [])

  return { address, chainId, isConnecting, error, connect }
}
