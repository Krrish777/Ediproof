'use client'

import { useMemo } from 'react'
import { ethers } from 'ethers'
import deployment from '@/lib/deployment.json'
import abi from '@/lib/EdiproofCertificate.abi.json'

const ALCHEMY_URL = 'https://eth-sepolia.g.alchemy.com/v2/24LEXOjVROKmZfZaPn6vx'
const CONTRACT_ADDRESS = deployment.address

export interface ContractHook {
  contract: ethers.Contract | null
  readContract: ethers.Contract
}

export function useContract(): ContractHook {
  const readContract = useMemo(() => {
    const provider = new ethers.JsonRpcProvider(ALCHEMY_URL)
    return new ethers.Contract(CONTRACT_ADDRESS, abi, provider)
  }, [])

  const contract = useMemo(() => {
    if (typeof window === 'undefined' || !window.ethereum) return null
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      // Return a contract that gets its signer lazily
      return new ethers.Contract(CONTRACT_ADDRESS, abi, provider)
    } catch {
      return null
    }
  }, [])

  return { contract, readContract }
}

export async function getSignedContract(): Promise<ethers.Contract | null> {
  if (typeof window === 'undefined' || !window.ethereum) return null
  try {
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    return new ethers.Contract(CONTRACT_ADDRESS, abi, signer)
  } catch {
    return null
  }
}
