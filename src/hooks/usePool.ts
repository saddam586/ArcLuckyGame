import { useAccount, useReadContract } from 'wagmi'
import { Amount, parseAmount, usdcDecimalsFor, usdcToGasToken, gasTokenToUsdc, gasTokenDecimalsFor } from '@/onchain-money'
import { GAME_ADDRESS, GAME_CHAIN_ID, gameAbi } from '@/lib/game'

/**
 * Smallest unreserved pool (USDC) that still accepts a play: the 0.10 maximum prize minus the
 * 0.0095 of each 0.01 entry that stays in the pool after the 5% fee. Mirrors the contract's check.
 */
const MIN_AVAILABLE_USDC = '0.0905'

export function usePool() {
  const { address } = useAccount()

  const { data: availableNative, refetch: refetchAvailable } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameAbi,
    functionName: 'availablePool',
    chainId: GAME_CHAIN_ID,
    query: { enabled: Boolean(GAME_ADDRESS), refetchInterval: 5000 },
  })

  const { data: owner } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameAbi,
    functionName: 'owner',
    chainId: GAME_CHAIN_ID,
    query: { enabled: Boolean(GAME_ADDRESS) },
  })

  const minNative = usdcToGasToken(GAME_CHAIN_ID, parseAmount(GAME_CHAIN_ID, MIN_AVAILABLE_USDC)).raw
  const available =
    availableNative === undefined
      ? undefined
      : gasTokenToUsdc(GAME_CHAIN_ID, Amount.fromRaw(availableNative, gasTokenDecimalsFor(GAME_CHAIN_ID)))
  const low = availableNative !== undefined && availableNative < minNative
  const isOwner = Boolean(address && owner && owner.toLowerCase() === address.toLowerCase())

  return { available, low, isOwner, refetchAvailable, usdcDecimals: usdcDecimalsFor(GAME_CHAIN_ID) }
}
