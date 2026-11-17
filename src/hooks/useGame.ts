import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { erc20Abi, parseEventLogs } from 'viem'
import {
  useAccount,
  useBlockNumber,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'
import { Amount, gasTokenDecimalsFor, gasTokenToUsdc, parseAmount, usdcDecimalsFor, usdcToGasToken } from '@/onchain-money'
import {
  boxOpenedEvent,
  ENTRY_FEE_USDC,
  friendlyError,
  GAME_ADDRESS,
  GAME_CHAIN_ID,
  gameAbi,
  GRID_SIZE,
  REVEAL_WINDOW_BLOCKS,
  USDC_ADDRESS,
} from '@/lib/game'
import { sfx } from '@/lib/sound'

export type Busy = 'signing-open' | 'confirming-open' | 'signing-reveal' | 'confirming-reveal' | null

export interface PendingPlay {
  box: number
  playId: bigint
  targetBlock: bigint
  /** The target block exists, so the prize can be revealed. */
  ready: boolean
  /** The block hash is about to fall out of the 256-block window. */
  expiring: boolean
  /** The window has passed: revealing clears the box but pays nothing. */
  expired: boolean
}

export interface GameResult {
  box: number
  reward: Amount
  txHash?: `0x${string}`
}

export function useGame() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: GAME_CHAIN_ID })

  const [busy, setBusy] = useState<Busy>(null)
  const [result, setResult] = useState<GameResult | null>(null)
  const [opened, setOpened] = useState<Record<number, Amount>>({})
  const [burst, setBurst] = useState(0)

  const { data: blockNumber } = useBlockNumber({ chainId: GAME_CHAIN_ID, watch: true })

  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: GAME_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 6000 },
  })

  const { data: pendingRaw, refetch: refetchPending } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameAbi,
    functionName: 'pending',
    args: address ? [address] : undefined,
    chainId: GAME_CHAIN_ID,
    query: { enabled: Boolean(address && GAME_ADDRESS), refetchInterval: 5000 },
  })

  const usdcDecimals = usdcDecimalsFor(GAME_CHAIN_ID)
  const entryFee = useMemo(() => parseAmount(GAME_CHAIN_ID, ENTRY_FEE_USDC), [])
  const balance = balanceRaw === undefined ? undefined : Amount.fromRaw(balanceRaw, usdcDecimals)
  const canAfford = balance ? balance.gte(entryFee) : false
  const wrongChain = isConnected && chainId !== GAME_CHAIN_ID

  const pending: PendingPlay | null = useMemo(() => {
    if (!pendingRaw) return null
    const [targetBlock, playId, box, exists] = pendingRaw
    if (!exists) return null
    const head = blockNumber ?? 0n
    return {
      box,
      playId,
      targetBlock,
      ready: head > targetBlock,
      expiring: head > targetBlock + REVEAL_WINDOW_BLOCKS - 60n,
      expired: head >= targetBlock + REVEAL_WINDOW_BLOCKS,
    }
  }, [pendingRaw, blockNumber])

  const refresh = useCallback(async () => {
    await Promise.all([refetchBalance(), refetchPending()])
  }, [refetchBalance, refetchPending])

  const open = useCallback(
    async (box: number) => {
      if (!address || !GAME_ADDRESS || !publicClient || box < 0 || box >= GRID_SIZE) return
      try {
        if (chainId !== GAME_CHAIN_ID) await switchChainAsync({ chainId: GAME_CHAIN_ID })
        sfx.tap()
        setBusy('signing-open')
        // The entry fee is paid as msg.value, which is the native (18-decimal) view of the same USDC.
        const value = usdcToGasToken(GAME_CHAIN_ID, entryFee).raw
        const hash = await writeContractAsync({
          address: GAME_ADDRESS,
          abi: gameAbi,
          functionName: 'playGame',
          args: [box],
          value,
          chainId: GAME_CHAIN_ID,
        })
        setBusy('confirming-open')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('reverted')
        sfx.lock()
        await refresh()
      } catch (error) {
        const message = friendlyError(error)
        if (message) toast.error(message)
      } finally {
        setBusy(null)
      }
    },
    [address, chainId, entryFee, publicClient, refresh, switchChainAsync, writeContractAsync],
  )

  const settleResult = useCallback(
    (box: number, rewardNative: bigint, txHash?: `0x${string}`) => {
      const reward = gasTokenToUsdc(GAME_CHAIN_ID, Amount.fromRaw(rewardNative, gasTokenDecimalsFor(GAME_CHAIN_ID)))
      setResult({ box, reward, txHash })
      setOpened((prev) => ({ ...prev, [box]: reward }))
      if (reward.isPositive()) {
        setBurst((n) => n + 1)
        sfx.win()
      } else {
        sfx.empty()
      }
    },
    [],
  )

  const reveal = useCallback(async () => {
    if (!address || !GAME_ADDRESS || !publicClient || !pending) return
    const snapshot = pending
    try {
      if (chainId !== GAME_CHAIN_ID) await switchChainAsync({ chainId: GAME_CHAIN_ID })
      setBusy('signing-reveal')
      let hash: `0x${string}`
      try {
        hash = await writeContractAsync({
          address: GAME_ADDRESS,
          abi: gameAbi,
          functionName: 'settle',
          args: [address],
          chainId: GAME_CHAIN_ID,
        })
      } catch (error) {
        // Anyone may settle for you; if someone already did, read the outcome from the logs.
        if (!(error instanceof Error) || !error.message.includes('NoPendingPlay')) throw error
        const logs = await publicClient.getLogs({
          address: GAME_ADDRESS,
          event: boxOpenedEvent,
          args: { player: address },
          fromBlock: snapshot.targetBlock,
        })
        const parsed = parseEventLogs({ abi: gameAbi, logs, eventName: 'BoxOpened' })
        const last = parsed[parsed.length - 1]
        if (last) settleResult(last.args.boxIndex, last.args.reward)
        await refresh()
        return
      }
      setBusy('confirming-reveal')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('reverted')
      const events = parseEventLogs({ abi: gameAbi, logs: receipt.logs, eventName: 'BoxOpened' })
      const mine = events.find((e) => e.args.player.toLowerCase() === address.toLowerCase())
      if (mine) settleResult(mine.args.boxIndex, mine.args.reward, receipt.transactionHash)
      await refresh()
    } catch (error) {
      const message = friendlyError(error)
      if (message) toast.error(message)
    } finally {
      setBusy(null)
    }
  }, [address, chainId, pending, publicClient, refresh, settleResult, switchChainAsync, writeContractAsync])

  const clearResult = useCallback(() => setResult(null), [])
  const resetBoard = useCallback(() => setOpened({}), [])

  return {
    address,
    isConnected,
    wrongChain,
    balance,
    canAfford,
    entryFee,
    pending,
    busy,
    result,
    opened,
    burst,
    blockNumber,
    open,
    reveal,
    clearResult,
    resetBoard,
    switchToGameChain: () => switchChainAsync({ chainId: GAME_CHAIN_ID }),
  }
}
