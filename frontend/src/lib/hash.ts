import { ethers } from 'ethers'

/**
 * Computes keccak256(abi.encodePacked(name, course, institution, ipfsURI))
 * Returns 0x-prefixed hex string, matches the on-chain hash computation.
 */
export function computeCertHash(
  name: string,
  course: string,
  institution: string,
  ipfsURI: string,
): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'string', 'string', 'string'],
    [name, course, institution, ipfsURI],
  )
}

/**
 * Format a timestamp string to a relative "time ago" string.
 */
export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

/**
 * Truncate an Ethereum address for display: 0xAbC…7890
 */
export function truncateAddress(addr: string, front = 6, back = 4): string {
  if (!addr || addr.length < front + back + 2) return addr
  return `${addr.slice(0, front)}…${addr.slice(-back)}`
}
