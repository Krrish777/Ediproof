'use client'

import { useMemo } from 'react'
import { ethers } from 'ethers'
import deployment from '@/lib/deployment.json'
import abi from '@/lib/EdiproofCertificate.abi.json'
import { getMetaMaskProvider } from '@/lib/wallet'

const ALCHEMY_URL = 'https://eth-sepolia.g.alchemy.com/v2/24LEXOjVROKmZfZaPn6vx'
const CONTRACT_ADDRESS = deployment.address

export interface ContractHook {
  readContract: ethers.Contract
}

export function useContract(): ContractHook {
  const readContract = useMemo(() => {
    const provider = new ethers.JsonRpcProvider(ALCHEMY_URL)
    return new ethers.Contract(CONTRACT_ADDRESS, abi, provider)
  }, [])

  return { readContract }
}

/**
 * Returns a Contract bound to a MetaMask signer — specifically MetaMask,
 * ignoring OKX/Coinbase/other injected wallets.
 * Throws if MetaMask is not installed or the user rejects the connection.
 */
export async function getSignedContract(): Promise<ethers.Contract> {
  const mm = getMetaMaskProvider()
  if (!mm) {
    throw new Error('MetaMask not found. Install it from metamask.io and refresh the page.')
  }
  const provider = new ethers.BrowserProvider(mm as unknown as ethers.Eip1193Provider)
  const signer = await provider.getSigner()
  return new ethers.Contract(CONTRACT_ADDRESS, abi, signer)
}
