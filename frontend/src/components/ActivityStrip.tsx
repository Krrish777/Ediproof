'use client'

import { useEffect, useState } from 'react'
import { fetchActivity, ActivityItem } from '@/lib/api'
import { timeAgo } from '@/lib/hash'

const FALLBACK: ActivityItem[] = [
  { kind: 'issued', tokenId: 1, txHash: '0xabc', actor: '0x1234', institution: 'MIT', createdAt: new Date(Date.now() - 120000).toISOString() },
  { kind: 'verified', tokenId: 2, txHash: '0xdef', actor: 'anonymous', institution: 'Oxford', createdAt: new Date(Date.now() - 360000).toISOString() },
  { kind: 'revoked', tokenId: 3, txHash: '0xfed', actor: '0xabcd', institution: 'Stanford', createdAt: new Date(Date.now() - 600000).toISOString() },
  { kind: 'issued', tokenId: 4, txHash: '0x111', actor: '0x5678', institution: 'Cambridge', createdAt: new Date(Date.now() - 900000).toISOString() },
  { kind: 'verified', tokenId: 5, txHash: '0x222', actor: 'anonymous', institution: 'Harvard', createdAt: new Date(Date.now() - 1200000).toISOString() },
  { kind: 'reissued', tokenId: 6, txHash: '0x333', actor: '0x9abc', institution: 'ETH Zurich', createdAt: new Date(Date.now() - 1800000).toISOString() },
]

const kindLabel: Record<string, string> = {
  issued: 'Issued',
  verified: 'Verified',
  revoked: 'Revoked',
  reissued: 'Reissued',
  forgery_attempt: 'Forgery Detected',
}

interface ActivityStripProps {
  label?: string
}

export default function ActivityStrip({ label = 'Live from the chain' }: ActivityStripProps) {
  const [items, setItems] = useState<ActivityItem[]>(FALLBACK)

  useEffect(() => {
    fetchActivity(20)
      .then((data) => {
        if (data && data.length > 0) setItems(data)
      })
      .catch(() => {
        // fallback already set
      })
  }, [])

  // Duplicate items for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className="activity-strip">
      <span className="activity-strip-label">{label}</span>
      <div className="activity-ticker-wrap">
        <div className="activity-ticker">
          {doubled.map((item, idx) => (
            <span key={idx} className="activity-ticker-item">
              <span style={{ color: 'var(--brass)', fontWeight: 500 }}>
                {kindLabel[item.kind] || item.kind}
              </span>
              {' '}
              {item.tokenId ? `#${item.tokenId}` : ''}
              {' '}
              {item.institution ? `· ${item.institution}` : ''}
              {' '}
              <span style={{ color: 'var(--ink-light)', fontSize: '0.7rem' }}>
                {timeAgo(item.createdAt)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
