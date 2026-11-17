import { motion } from 'framer-motion'
import { Gift, Lock } from 'lucide-react'
import type { Amount } from '@/onchain-money'
import { GRID_SIZE } from '@/lib/game'

const TINTS = ['95,190,255', '175,143,244', '240,92,107', '255,205,131', '126,241,179']

interface GridProps {
  opened: Record<number, Amount>
  lockedBox: number | null
  disabled: boolean
  onPick: (box: number) => void
}

export function Grid({ opened, lockedBox, disabled, onPick }: GridProps) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3" role="grid" aria-label="Mystery boxes">
      {Array.from({ length: GRID_SIZE }, (_, box) => {
        const result = opened[box]
        const isOpen = result !== undefined
        const isWin = isOpen && result.isPositive()
        const isLocked = lockedBox === box
        const tint = TINTS[(Math.floor(box / 5) + (box % 5)) % TINTS.length]
        const label = isOpen
          ? isWin
            ? `Box ${box + 1}: won ${result.toFixed(2)} USDC`
            : `Box ${box + 1}: empty`
          : isLocked
            ? `Box ${box + 1}: locked in, waiting for reveal`
            : `Open box ${box + 1}`

        return (
          <motion.button
            key={box}
            type="button"
            role="gridcell"
            aria-label={label}
            disabled={disabled || isOpen || isLocked}
            onClick={() => onPick(box)}
            whileHover={disabled || isOpen ? undefined : { y: -3 }}
            whileTap={disabled || isOpen ? undefined : { scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="relative flex aspect-square min-h-[44px] items-center justify-center rounded-2xl border text-sm font-bold disabled:cursor-not-allowed"
            style={{
              background: isWin
                ? 'rgba(26,128,71,0.14)'
                : isOpen
                  ? 'rgba(18,45,69,0.05)'
                  : `linear-gradient(145deg, rgba(${tint},0.34), rgba(${tint},0.14))`,
              borderColor: isLocked ? 'var(--accent)' : isWin ? 'rgba(26,128,71,0.4)' : 'rgba(255,255,255,0.7)',
              borderWidth: isLocked ? 2 : 1,
              color: isWin ? 'var(--success)' : 'var(--ink)',
              boxShadow: isOpen ? 'none' : '0 4px 14px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
              opacity: disabled && !isOpen && !isLocked ? 0.7 : 1,
            }}
          >
            {isOpen ? (
              <motion.span
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="display tabular-nums"
                style={{ fontSize: isWin ? 14 : 12, color: isWin ? 'var(--success)' : 'var(--subtle)' }}
              >
                {isWin ? `+${result.toFixed(2)}` : 'Empty'}
              </motion.span>
            ) : isLocked ? (
              <motion.span
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
              >
                <Lock size={20} />
              </motion.span>
            ) : (
              <Gift size={20} strokeWidth={2.2} />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
