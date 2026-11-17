# Arc Lucky Grid

A hyper-casual USDC mystery-box game on Arc Testnet. Pick one of 25 boxes for 0.01 USDC and win 0.02, 0.05 or 0.10 USDC, paid straight to your wallet. Every box has the same odds, and a 5% platform fee goes to the game owner.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, TypeScript, Vite, Tailwind CSS
- wagmi, viem and ConnectKit for wallets and contract calls
- Solidity 0.8.28 and OpenZeppelin, built and tested with Foundry

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run dev        # start the app
bun run check      # lint and typecheck
bun run build      # production build
forge test         # contract tests
```

### Environment variables

- `VITE_ARC_LUCKY_GRID_ADDRESS`: address of the deployed game contract. The game stays disabled until it is set.
- `VITE_ARC_LUCKY_GRID_DEPLOY_BLOCK`: block the contract was deployed at. Optional; limits how far back the winners feed looks.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio. Optional outside Arc Studio.

## Contract

`contracts/ArcLuckyGrid.sol` holds the prize pool in native USDC (18 decimals on Arc). The owner funds the pool with `addLiquidity()` and can withdraw unreserved funds with `withdrawFunds(amount)`. Randomness is demo-grade and meant for testnet only. Use a verifiable randomness service before putting real value behind it.

## Owner tools

When the owner wallet is connected, an Owner tools card appears under the board to add liquidity to the prize pool or withdraw unreserved funds.

## How a round plays

1. Pick a box and confirm the 0.01 USDC entry.
2. After the next block, tap Reveal (no fee) to see and collect your prize.
