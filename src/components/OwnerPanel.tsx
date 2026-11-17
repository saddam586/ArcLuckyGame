import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Shield } from 'lucide-react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { Amount, AmountError, parseAmount, usdcToGasToken } from '@/onchain-money'
import { friendlyError, GAME_ADDRESS, GAME_CHAIN_ID, gameAbi } from '@/lib/game'

interface OwnerPanelProps {
  available: Amount | undefined
  onDone: () => void
}

/** Shown only to the contract owner: fund the prize pool or withdraw unreserved funds. */
export function OwnerPanel({ available, onDone }: OwnerPanelProps) {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: GAME_CHAIN_ID })
  const [amount, setAmount] = useState('1')
  const [working, setWorking] = useState<'add' | 'withdraw' | null>(null)

  const run = async (kind: 'add' | 'withdraw') => {
    if (!GAME_ADDRESS || !publicClient) return
    let parsed: Amount
    try {
      parsed = parseAmount(GAME_CHAIN_ID, amount)
    } catch (error) {
      toast.error(error instanceof AmountError ? 'Enter an amount with up to 6 decimals.' : 'Enter a valid amount.')
      return
    }
    if (!parsed.isPositive()) {
      toast.error('Enter an amount above zero.')
      return
    }
    // The contract works in the native 18-decimal view of the same USDC.
    const native = usdcToGasToken(GAME_CHAIN_ID, parsed).raw
    try {
      setWorking(kind)
      if (chainId !== GAME_CHAIN_ID) await switchChainAsync({ chainId: GAME_CHAIN_ID })
      const hash =
        kind === 'add'
          ? await writeContractAsync({
              address: GAME_ADDRESS,
              abi: gameAbi,
              functionName: 'addLiquidity',
              value: native,
              chainId: GAME_CHAIN_ID,
            })
          : await writeContractAsync({
              address: GAME_ADDRESS,
              abi: gameAbi,
              functionName: 'withdrawFunds',
              args: [native],
              chainId: GAME_CHAIN_ID,
            })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('reverted')
      toast.success(kind === 'add' ? 'Prize pool funded.' : 'Funds withdrawn.')
      onDone()
    } catch (error) {
      const message = friendlyError(error)
      if (message) toast.error(message)
    } finally {
      setWorking(null)
    }
  }

  return (
    <section aria-label="Owner tools" className="glass-card mt-4 rounded-[28px] p-5">
      <h2 className="display flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--ink)' }}>
        <Shield size={18} /> Owner tools
      </h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        Only you see this. Withdrawals can't touch prizes reserved for open boxes
        {available ? ` (${available.toFixed(2)} USDC available now)` : ''}.
      </p>
      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }} htmlFor="owner-amount">
        Amount (USDC)
      </label>
      <input
        id="owner-amount"
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="glass-inner display mt-1 h-12 w-full rounded-2xl px-4 text-xl font-bold tabular-nums outline-none focus:ring-2"
        style={{ color: 'var(--ink)' }}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={working !== null}
          onClick={() => void run('add')}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {working === 'add' ? <Loader2 size={16} className="animate-spin" /> : null}
          Add liquidity
        </button>
        <button
          type="button"
          disabled={working !== null}
          onClick={() => void run('withdraw')}
          className="glass-pill flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold disabled:opacity-60"
          style={{ color: 'var(--ink)' }}
        >
          {working === 'withdraw' ? <Loader2 size={16} className="animate-spin" /> : null}
          Withdraw
        </button>
      </div>
    </section>
  )
}
