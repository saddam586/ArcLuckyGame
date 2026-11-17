import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, PartyPopper, PackageOpen } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { GAME_CHAIN_ID } from '@/lib/game'
import type { GameResult } from '@/hooks/useGame'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

export function ResultSheet({ result, onClose }: { result: GameResult | null; onClose: () => void }) {
  useEffect(() => {
    if (!result) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, onClose])

  const won = result?.reward.isPositive() ?? false

  return (
    <AnimatePresence>
      {result ? (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(18,45,69,0.28)] p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={won ? 'You won' : 'Empty box'}
            className="glass-card relative w-full max-w-sm overflow-hidden rounded-[32px] px-6 pb-6 pt-8 text-center"
            style={{ background: 'rgba(255,255,255,0.92)' }}
            initial={{ y: 40, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: spectral }} />
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                background: won ? 'rgba(26,128,71,0.12)' : 'rgba(18,45,69,0.07)',
                color: won ? 'var(--success)' : 'var(--subtle)',
              }}
            >
              {won ? <PartyPopper size={26} /> : <PackageOpen size={26} />}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Box {result.box + 1}
            </p>
            <h2 className="display mt-1 text-balance text-4xl font-bold tabular-nums" style={{ color: won ? 'var(--success)' : 'var(--ink)' }}>
              {won ? `+${result.reward.toFixed(2)} USDC` : 'Empty box'}
            </h2>
            <p className="mt-2 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
              {won ? 'Paid straight to your wallet.' : 'No prize this time. Every box is a fresh draw.'}
            </p>
            {result.txHash ? (
              <a
                href={buildTxExplorerUrl(GAME_CHAIN_ID, result.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--accent-hover)' }}
              >
                View transaction <ExternalLink size={12} />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 h-14 w-full rounded-2xl text-base font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              Play again
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
