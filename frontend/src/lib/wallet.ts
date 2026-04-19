/**
 * Wallet provider discovery.
 *
 * When multiple wallet extensions are installed (MetaMask, OKX, Coinbase, etc.),
 * they all race to inject themselves into `window.ethereum`. Whoever wins last
 * "owns" it — OKX is a notorious hijacker. EIP-6963 (Multi Injected Provider
 * Discovery) fixes this: each wallet announces itself separately, and we pick
 * the one we want by its reverse-DNS identifier.
 */

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void
  isMetaMask?: boolean
}

interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: EIP1193Provider
}

const announced: EIP6963ProviderDetail[] = []

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail
    if (detail?.info?.uuid && !announced.find(p => p.info.uuid === detail.info.uuid)) {
      announced.push(detail)
    }
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

/**
 * Returns the MetaMask provider specifically, ignoring OKX/Coinbase/etc.
 * Falls back to legacy detection methods for older MetaMask installs.
 */
export function getMetaMaskProvider(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null

  // 1. EIP-6963 discovery — the correct, modern path.
  const mm = announced.find(p => p.info.rdns === 'io.metamask')
  if (mm) return mm.provider

  // 2. Legacy: some wallets populate window.ethereum.providers[] when multiple exist.
  const w = window as unknown as { ethereum?: EIP1193Provider & { providers?: EIP1193Provider[] } }
  if (Array.isArray(w.ethereum?.providers)) {
    const fromArray = w.ethereum.providers.find(p => p.isMetaMask)
    if (fromArray) return fromArray
  }

  // 3. Last resort: window.ethereum itself, but only if it's really MetaMask.
  if (w.ethereum?.isMetaMask) return w.ethereum

  return null
}

/**
 * Returns the list of all announced wallets (for debugging / future multi-wallet UI).
 */
export function getAnnouncedProviders(): EIP6963ProviderDetail[] {
  return announced.slice()
}
