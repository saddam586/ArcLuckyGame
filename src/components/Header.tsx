import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Volume2, VolumeX } from 'lucide-react'
import { isMuted, setMuted } from '@/lib/sound'
import { shortAddress } from '@/lib/game'

export function Header() {
  const [muted, setMutedState] = useState(isMuted)

  const toggle = () => {
    setMuted(!muted)
    setMutedState(!muted)
  }

  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-balance text-[28px] font-bold leading-none" style={{ color: 'var(--ink)' }}>
          Arc Lucky Grid
        </h1>
        <p className="mt-1.5 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          Open a box for 0.01 USDC. Win up to 0.10.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          aria-pressed={!muted}
          className="glass-pill flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ color: 'var(--ink)' }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <ConnectKitButton.Custom>
          {({ isConnected, isConnecting, show, address }) => (
            <button
              type="button"
              onClick={show}
              className="h-11 rounded-full px-4 text-sm font-semibold text-white transition-transform active:scale-95"
              style={{ background: 'var(--accent)' }}
            >
              {isConnecting ? 'Connecting...' : isConnected && address ? shortAddress(address) : 'Connect'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  )
}
