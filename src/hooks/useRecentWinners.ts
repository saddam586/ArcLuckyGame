import { useCallback, useEffect, useState } from 'react'
import { useWatchContractEvent, usePublicClient } from 'wagmi'
import { Amount, gasTokenDecimalsFor, gasTokenToUsdc } from '@/onchain-money'
import { boxOpenedEvent, GAME_ADDRESS, GAME_CHAIN_ID, GAME_DEPLOY_BLOCK, gameAbi } from '@/lib/game'

export interface Winner {
  key: string
  player: `0x${string}`
  box: number
  reward: Amount
  blockNumber: bigint
  logIndex: number
}

const FEED_SIZE = 12
const CHUNK = 2000n
const MAX_LOOKBACK = 20000n

interface RawLog {
  args: { player?: `0x${string}`; boxIndex?: number; reward?: bigint }
  blockNumber: bigint | null
  logIndex: number | null
  transactionHash: `0x${string}` | null
}

function toWinner(log: RawLog): Winner | null {
  const { player, boxIndex, reward } = log.args
  if (!player || boxIndex === undefined || !reward || reward === 0n) return null
  if (log.blockNumber === null || log.logIndex === null || !log.transactionHash) return null
  return {
    key: `${log.transactionHash}-${log.logIndex}`,
    player,
    box: boxIndex,
    reward: gasTokenToUsdc(GAME_CHAIN_ID, Amount.fromRaw(reward, gasTokenDecimalsFor(GAME_CHAIN_ID))),
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
  }
}

const newestFirst = (a: Winner, b: Winner) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1

function merge(current: Winner[], incoming: Winner[]): Winner[] {
  const byKey = new Map(current.map((w) => [w.key, w]))
  for (const w of incoming) byKey.set(w.key, w)
  return [...byKey.values()].sort(newestFirst).slice(0, FEED_SIZE)
}

/**
 * Recent winners: scans backwards from the chain head in bounded chunks (never from block 0),
 * stopping at the deployment block, a fixed lookback, or when the feed is full.
 */
export function useRecentWinners() {
  const publicClient = usePublicClient({ chainId: GAME_CHAIN_ID })
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(Boolean(GAME_ADDRESS))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!publicClient || !GAME_ADDRESS) return
    let cancelled = false

    const load = async () => {
      try {
        const head = await publicClient.getBlockNumber()
        const lookbackFloor = head > MAX_LOOKBACK ? head - MAX_LOOKBACK : 0n
        const floor = GAME_DEPLOY_BLOCK !== undefined && GAME_DEPLOY_BLOCK > lookbackFloor ? GAME_DEPLOY_BLOCK : lookbackFloor
        let collected: Winner[] = []
        let to = head
        while (to >= floor && collected.length < FEED_SIZE && !cancelled) {
          const from = to - CHUNK + 1n > floor ? to - CHUNK + 1n : floor
          const logs = await publicClient.getLogs({
            address: GAME_ADDRESS,
            event: boxOpenedEvent,
            fromBlock: from,
            toBlock: to,
          })
          const found = logs.map((l) => toWinner(l as RawLog)).filter((w): w is Winner => w !== null)
          collected = merge(collected, found)
          if (from === floor) break
          to = from - 1n
        }
        if (!cancelled) {
          setWinners((prev) => merge(prev, collected))
          setFailed(false)
        }
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [publicClient])

  const onLogs = useCallback((logs: readonly RawLog[]) => {
    const incoming = logs.map(toWinner).filter((w): w is Winner => w !== null)
    if (incoming.length > 0) setWinners((prev) => merge(prev, incoming))
  }, [])

  useWatchContractEvent({
    address: GAME_ADDRESS,
    abi: gameAbi,
    eventName: 'BoxOpened',
    chainId: GAME_CHAIN_ID,
    enabled: Boolean(GAME_ADDRESS),
    onLogs: onLogs,
  })

  return { winners, loading, failed }
}
