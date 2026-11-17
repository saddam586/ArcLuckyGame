import { TokenUSDC } from '@web3icons/react'
import { useBalance } from 'wagmi'
import { Amount, gasTokenDecimalsFor, gasTokenToUsdc } from '@/onchain-money'
import { GAME_ADDRESS, GAME_CHAIN_ID, PRIZE_TIERS } from '@/lib/game'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-inner min-w-0 flex-1 rounded-2xl px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        {label}
      </p>
      <p className="display mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
        <TokenUSDC variant="branded" size={20} />
        <span className="truncate">{value}</span>
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Stats({ balance }: { balance: Amount | undefined }) {
  // The pool is a contract's native (18-decimal) balance; convert it into the 6-decimal USDC view.
  const { data: pool } = useBalance({
    address: GAME_ADDRESS,
    chainId: GAME_CHAIN_ID,
    query: { enabled: Boolean(GAME_ADDRESS), refetchInterval: 5000 },
  })
  const poolUsdc = pool ? gasTokenToUsdc(GAME_CHAIN_ID, Amount.fromRaw(pool.value, gasTokenDecimalsFor(GAME_CHAIN_ID))) : undefined

  return (
    <section aria-label="Balances" className="glass-card rounded-[28px] p-3">
      <div className="flex gap-2">
        <Stat label="Your balance" value={balance ? balance.toFixed(2) : '--'} hint="USDC" />
        <Stat label="Prize pool" value={poolUsdc ? poolUsdc.toFixed(2) : '--'} hint="USDC" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 px-1 pb-1">
        {PRIZE_TIERS.map((tier) => (
          <div key={tier.amount} className="glass-pill flex flex-1 items-center justify-center gap-2 rounded-full px-2 py-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tier.tint }} />
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
              {tier.amount}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
              {tier.odds}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
