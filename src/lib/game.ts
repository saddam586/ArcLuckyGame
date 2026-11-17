import { isAddress, parseAbi, parseAbiItem, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'

export const GAME_CHAIN = arcTestnet
export const GAME_CHAIN_ID = arcTestnet.id

const rawAddress = import.meta.env.VITE_ARC_LUCKY_GRID_ADDRESS as string | undefined
/** Set by `.env` after the contract is deployed; undefined until then. */
export const GAME_ADDRESS: Address | undefined =
  rawAddress && isAddress(rawAddress) ? (rawAddress) : undefined

const rawBlock = import.meta.env.VITE_ARC_LUCKY_GRID_DEPLOY_BLOCK as string | undefined
/** Block the contract was deployed at; bounds how far back the winners feed scans. */
export const GAME_DEPLOY_BLOCK: bigint | undefined =
  rawBlock && /^\d+$/.test(rawBlock) ? BigInt(rawBlock) : undefined

const usdc = getUsdc(GAME_CHAIN_ID)
if (!usdc) throw new Error('USDC is missing from the onchain facts for Arc Testnet')
export const USDC_ADDRESS = usdc.address as Address

export const GRID_SIZE = 25
export const ENTRY_FEE_USDC = '0.01'

/** Display-only prize table; the contract owns the real odds and amounts. */
export const PRIZE_TIERS = [
  { amount: '0.10', odds: '1.5%', tint: '#ffcd83' },
  { amount: '0.05', odds: '4%', tint: '#af8ff4' },
  { amount: '0.02', odds: '25%', tint: '#5fbeff' },
] as const

export const gameAbi = parseAbi([
  'function playGame(uint8 boxIndex) payable',
  'function settle(address player) returns (uint256 reward)',
  'function pending(address player) view returns (uint64 targetBlock, uint64 playId, uint8 boxIndex, bool exists)',
  'function prizePool() view returns (uint256)',
  'function availablePool() view returns (uint256)',
  'function reservedLiability() view returns (uint256)',
  'function totalPlays() view returns (uint256)',
  'function owner() view returns (address)',
  'function addLiquidity() payable',
  'function withdrawFunds(uint256 amount)',
  'event BoxCommitted(address indexed player, uint8 indexed boxIndex, uint256 playId, uint256 targetBlock)',
  'event BoxOpened(address indexed player, uint8 indexed boxIndex, uint256 reward, uint256 playId)',
  'error InvalidBox()',
  'error WrongEntryFee()',
  'error ContractsNotAllowed()',
  'error PlayPending()',
  'error NoPendingPlay()',
  'error TooEarly()',
  'error TransferFailed()',
  'error PoolTooLow()',
  'error ZeroAmount()',
  'error InsufficientBalance()',
  'error RenounceDisabled()',
])

export const boxOpenedEvent = parseAbiItem(
  'event BoxOpened(address indexed player, uint8 indexed boxIndex, uint256 reward, uint256 playId)',
)

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Blocks after the target during which the target block hash is still readable onchain. */
export const REVEAL_WINDOW_BLOCKS = 256n

export function friendlyError(error: unknown): string | null {
  const text = (error instanceof Error ? error.message : typeof error === 'string' ? error : '').toLowerCase()
  if (text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) {
    return null
  }
  if (text.includes('pooltoolow')) {
    return 'The prize pool is refilling. Try again in a moment.'
  }
  if (text.includes('playpending')) return 'Reveal your current box before opening another.'
  if (text.includes('tooearly')) return 'Hold on, the next block has not landed yet.'
  if (text.includes('insufficient funds') || text.includes('exceeds balance')) {
    return 'Not enough USDC. Use "Get test USDC" in the sidebar, then try again.'
  }
  if (text.includes('network') || text.includes('timeout') || text.includes('fetch')) {
    return 'Network hiccup. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}
