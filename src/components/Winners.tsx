import { AnimatePresence, motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { GAME_ADDRESS, GAME_CHAIN_ID, shortAddress } from '@/lib/game'
import type { Winner } from '@/hooks/useRecentWinners'

export function Winners({ winners, loading, failed }: { winners: Winner[]; loading: boolean; failed: boolean }) {
  return (
    <section aria-label="Recent winners" className="glass-card mt-4 rounded-[28px] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="display flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--ink)' }}>
          <Trophy size={18} /> Recent winners
        </h2>
        {GAME_ADDRESS ? (
          <a
            href={buildAddressExplorerUrl(GAME_CHAIN_ID, GAME_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] content-center text-xs font-semibold"
            style={{ color: 'var(--accent-hover)' }}
          >
            Contract
          </a>
        ) : null}
      </div>

      {winners.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--muted)' }}>
          {!GAME_ADDRESS
            ? 'Winners appear here once the game is live.'
            : loading
              ? 'Loading recent winners...'
              : failed
                ? 'Could not load the feed. New wins still show up live.'
                : 'No winners yet. Be the first.'}
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {winners.map((winner) => (
              <motion.li
                key={winner.key}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass-inner flex items-center justify-between rounded-2xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="mono truncate text-sm" style={{ color: 'var(--ink)' }}>
                    {shortAddress(winner.player)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Box {winner.box + 1}
                  </p>
                </div>
                <p className="display text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                  +{winner.reward.toFixed(2)} USDC
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
