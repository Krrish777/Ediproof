const BASE_URL = 'http://localhost:8787'

export type ActivityItem = {
  kind: string
  tokenId: number
  txHash: string
  actor: string
  institution: string
  createdAt: string
}

export type Stats = {
  totalIssued: number
  institutionCount: number
  totalVerified: number
  forgeryCount: number
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${BASE_URL}/api/stats`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

export async function fetchActivity(limit = 20): Promise<ActivityItem[]> {
  const res = await fetch(`${BASE_URL}/api/activity?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch activity')
  return res.json()
}

export async function logEvent(payload: {
  kind: string
  tokenId?: number
  txHash?: string
  actor: string
  institution: string
}): Promise<void> {
  await fetch(`${BASE_URL}/api/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function uploadFile(file: File): Promise<{ cid: string; ipfsURI: string; gatewayURL: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Failed to upload file')
  return res.json()
}

export async function fetchInstitutionStats(address: string): Promise<{ count: number }> {
  const res = await fetch(`${BASE_URL}/api/institution/${address}`)
  if (!res.ok) return { count: 0 }
  return res.json()
}
