import { Loader2 } from 'lucide-react'
import type { Busy, PendingPlay } from '@/hooks/useGame'
import { ENTRY_FEE_USDC } from '@/lib/game'

interface ActionBarProps {
  deployed: boolean
  isConnected: boolean
  wrongChain: boolean
  canAfford: boolean
  poolLow: boolean
  balanceKnown: boolean
  pending: PendingPlay | null
  busy: Busy
  boardHasResults: boolean
  onConnect: () => void
  onSwitch: () => void
  onReveal: () => void
  onResetBoard: () => void
}

function Primary({
  children,
  onClick,
  disabled,
  spinning,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  spinning?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ background: 'var(--accent)' }}
    >
      {spinning ? <Loader2 size={18} className="animate-spin" /> : null}
      {children}
    </button>
  )
}

export function ActionBar(props: ActionBarProps) {
  const { deployed, isConnected, wrongChain, canAfford, balanceKnown, pending, busy, boardHasResults } = props

  let body: React.ReactNode
  let note: string

  if (!deployed) {
    body = <Primary disabled>Game not live yet</Primary>
    note = 'The contract address is not configured yet. Deploy the contract and set VITE_ARC_LUCKY_GRID_ADDRESS.'
  } else if (!isConnected) {
    body = <Primary onClick={props.onConnect}>Connect wallet to play</Primary>
    note = 'Arc Testnet. Test USDC only.'
  } else if (wrongChain) {
    body = <Primary onClick={props.onSwitch}>Switch to Arc Testnet</Primary>
    note = 'Your wallet is on a different network.'
  } else if (busy === 'signing-open' || busy === 'signing-reveal') {
    body = (
      <Primary disabled spinning>
        Confirm in your wallet
      </Primary>
    )
    note = busy === 'signing-open' ? `Locking in your box for ${ENTRY_FEE_USDC} USDC.` : 'Revealing your prize. No entry fee.'
  } else if (busy === 'confirming-open' || busy === 'confirming-reveal') {
    body = (
      <Primary disabled spinning>
        Confirming onchain
      </Primary>
    )
    note = 'Usually under a few seconds on Arc.'
  } else if (pending && !pending.ready) {
    body = (
      <Primary disabled spinning>
        Box {pending.box + 1} locked in
      </Primary>
    )
    note = 'Waiting for the next block. It decides your prize, so nobody can know it in advance.'
  } else if (pending) {
    body = (
      <Primary onClick={props.onReveal}>
        {pending.expired ? `Clear box ${pending.box + 1}` : `Reveal box ${pending.box + 1}`}
      </Primary>
    )
    note = pending.expired
      ? 'The reveal window passed, so this box pays nothing. Clear it to play again.'
      : pending.expiring
        ? 'Reveal now. The window to claim this prize is about to close.'
        : 'Free to reveal. Your prize is paid straight to your wallet.'
  } else if (props.poolLow) {
    body = <Primary disabled>Prize pool is refilling</Primary>
    note = 'The pool needs more USDC before new boxes can open. Check back soon.'
  } else if (balanceKnown && !canAfford) {
    body = <Primary disabled>Need {ENTRY_FEE_USDC} USDC to play</Primary>
    note = 'Tap "Get test USDC" in the sidebar to top up.'
  } else {
    body = <Primary disabled>Pick a box</Primary>
    note = `Each box costs ${ENTRY_FEE_USDC} USDC. Every box has the same odds.`
  }

  return (
    <div className="mt-5">
      {body}
      <p className="mt-3 text-center text-pretty text-xs" style={{ color: 'var(--muted)' }} aria-live="polite">
        {note}
      </p>
      {boardHasResults && !pending && !busy ? (
        <button
          type="button"
          onClick={props.onResetBoard}
          className="mx-auto mt-2 block min-h-[44px] rounded-full px-4 text-xs font-semibold underline-offset-4 hover:underline"
          style={{ color: 'var(--accent-hover)' }}
        >
          Reset board
        </button>
      ) : null}
    </div>
  )
}
