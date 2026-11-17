// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Arc Lucky Grid
/// @notice A demo 5x5 native-USDC game for Arc Testnet, where USDC has 18 decimals.
/// @dev The `ether` denomination below means 1e18 native units, not ETH on Arc.
/// Each play has a 1.5% chance of 0.10 USDC, 4% of 0.05 USDC,
/// 25% of 0.02 USDC, and 69.5% of zero. Expected payout is 0.0085 USDC
/// per 0.01 USDC entry, below the 0.0095 USDC retained after the 5% fee;
/// the pool therefore grows on average, not necessarily on every play.
/// The outcome is bound to a future block hash that did not exist when the
/// player committed, so it cannot be precomputed at commit time. Anyone can
/// settle; non-revealing only forfeits the entry fee. Block producers retain
/// influence on block hashes: this is suitable for testnet/demo use, and a VRF
/// is recommended for mainnet value.
/// There is deliberately no receive or fallback function for stray payments.
contract ArcLuckyGrid is Ownable, ReentrancyGuard {
    /// @notice Exact native-USDC payment required for one play.
    uint256 public constant ENTRY_FEE = 0.01 ether;

    /// @notice Owner fee in basis points, out of 10,000 (5%).
    uint256 public constant FEE_BPS = 500;

    /// @notice Number of boxes; valid indices are 0 through 24.
    uint256 public constant GRID_SIZE = 25;

    /// @notice Low prize, paid for 2,500 of 10,000 roll values.
    uint256 public constant REWARD_LOW = 0.02 ether;

    /// @notice Middle prize, paid for 400 of 10,000 roll values.
    uint256 public constant REWARD_MID = 0.05 ether;

    /// @notice High prize, paid for 150 of 10,000 roll values.
    uint256 public constant REWARD_HIGH = 0.10 ether;

    /// @notice Maximum possible payout; required pool balance after the fee.
    uint256 public constant MAX_REWARD = REWARD_HIGH;

    /// @notice Number of committed plays, also the latest play identifier.
    uint256 public totalPlays;

    /// @notice Maximum payouts reserved for all pending plays.
    uint256 public reservedLiability;

    /// @notice A pending play, packed into one storage slot.
    /// @param targetBlock Future block whose hash determines the outcome.
    /// @param playId Monotonically increasing play identifier.
    /// @param boxIndex Selected box, from 0 through 24.
    /// @param exists Whether this play awaits settlement.
    struct Play {
        uint64 targetBlock;
        uint64 playId;
        uint8 boxIndex;
        bool exists;
    }

    /// @notice Pending play for each player; at most one per player.
    mapping(address => Play) public pending;

    /// @notice The box index is outside the grid.
    error InvalidBox();

    /// @notice The payment is not exactly ENTRY_FEE.
    error WrongEntryFee();

    /// @notice The immediate caller is not the transaction origin.
    error ContractsNotAllowed();

    /// @notice The caller already has a pending play.
    error PlayPending();

    /// @notice The specified player has no pending play.
    error NoPendingPlay();

    /// @notice The target block has not yet finished.
    error TooEarly();

    /// @notice A native-USDC transfer failed.
    error TransferFailed();

    /// @notice The pool after the owner fee cannot cover all reserved maximum payouts.
    error PoolTooLow();

    /// @notice A positive amount is required.
    error ZeroAmount();

    /// @notice The requested withdrawal exceeds the unreserved pool balance.
    error InsufficientBalance();

    /// @notice Ownership renunciation is disabled to preserve pool administration.
    error RenounceDisabled();

    /// @notice Emitted when a play is committed, before its outcome is known.
    /// @param player Player who paid for the play.
    /// @param boxIndex Selected box, from 0 through 24.
    /// @param playId Monotonically increasing play identifier, starting at one.
    /// @param targetBlock Future block whose hash determines the outcome.
    event BoxCommitted(address indexed player, uint8 indexed boxIndex, uint256 playId, uint256 targetBlock);

    /// @notice Emitted on settlement, including empty, forfeited or failed payouts.
    /// @param player Player who paid for the play.
    /// @param boxIndex Selected box, from 0 through 24.
    /// @param reward Native-USDC amount actually paid; zero if no payout succeeded.
    /// @param playId Monotonically increasing play identifier, starting at one.
    event BoxOpened(address indexed player, uint8 indexed boxIndex, uint256 reward, uint256 playId);

    /// @notice Emitted when the owner funds the pool through addLiquidity.
    /// @param from Funding owner.
    /// @param amount Native-USDC amount in 18-decimal units.
    event LiquidityAdded(address indexed from, uint256 amount);

    /// @notice Emitted when the owner withdraws pool funds.
    /// @param to Owner receiving the withdrawal.
    /// @param amount Native-USDC amount in 18-decimal units.
    event FundsWithdrawn(address indexed to, uint256 amount);

    /// @notice Creates the game with its initial owner and fee recipient.
    /// @dev Ownable rejects a zero initial owner; ReentrancyGuard initializes its guard.
    /// @param initialOwner Initial owner, also the recipient of play fees.
    constructor(address initialOwner) Ownable(initialOwner) ReentrancyGuard() {}

    /// @notice Pays exactly 0.01 native USDC to commit to one of 25 boxes.
    /// @dev The tx.origin restriction only blocks contract callers; it is not
    /// bot resistance or proof of a human player. Selecting a box does not
    /// reserve it or remove it from the grid. The outcome is bound to the hash
    /// of block.number + 1, which did not exist at commit time; no reward is
    /// drawn here. All state is written before the fee call, and any failure
    /// reverts all effects and transfers. The post-fee pool must cover existing
    /// liabilities plus this play's maximum payout.
    /// @param boxIndex Box to open, from 0 through 24.
    function playGame(uint8 boxIndex) external payable nonReentrant {
        if (boxIndex >= GRID_SIZE) revert InvalidBox();
        if (msg.value != ENTRY_FEE) revert WrongEntryFee();
        if (msg.sender != tx.origin) revert ContractsNotAllowed();
        if (pending[msg.sender].exists) revert PlayPending();

        uint256 fee = msg.value * FEE_BPS / 10_000;
        // Pool left after the fee leaves must cover all reserved payouts plus this play's maximum.
        if (address(this).balance - fee < reservedLiability + MAX_REWARD) revert PoolTooLow();

        // Effects before the external fee call (checks-effects-interactions).
        uint256 playId = ++totalPlays;
        reservedLiability += MAX_REWARD;
        uint64 targetBlock = uint64(block.number + 1);
        pending[msg.sender] = Play({
            targetBlock: targetBlock,
            playId: uint64(playId),
            boxIndex: boxIndex,
            exists: true
        });

        (bool feeSent, ) = payable(owner()).call{value: fee}("");
        if (!feeSent) revert TransferFailed();

        emit BoxCommitted(msg.sender, boxIndex, playId, targetBlock);
    }

    /// @notice Settles any player's pending play and releases its reserved payout.
    /// @dev Anyone can settle after the target block. Non-revealing only forfeits
    /// the entry fee: once the 256-block hash window expires, settlement pays zero.
    /// Pending state and liability are cleared before attempting a payout; a
    /// failed payout stays in the pool and does not revert or lock liquidity.
    /// The future hash prevents precomputation at commit time, but block-producer
    /// influence remains. Suitable for testnet/demo; use a VRF for mainnet value.
    /// Modulo 10,000 introduces negligible bias, not cryptographic exact uniformity.
    /// @param player Player whose pending play is to be settled.
    /// @return reward Native-USDC amount actually paid, or zero.
    function settle(address player) external nonReentrant returns (uint256 reward) {
        Play memory play = pending[player];
        if (!play.exists) revert NoPendingPlay();
        if (block.number <= play.targetBlock) revert TooEarly();

        delete pending[player];
        reservedLiability -= MAX_REWARD;

        bytes32 h = blockhash(play.targetBlock);
        if (h != bytes32(0)) {
            uint256 roll = uint256(
                keccak256(abi.encode(h, player, play.boxIndex, play.playId, address(this)))
            ) % 10_000;
            if (roll < 150) {
                reward = REWARD_HIGH;
            } else if (roll < 550) {
                reward = REWARD_MID;
            } else if (roll < 3_050) {
                reward = REWARD_LOW;
            }
        }

        if (reward > 0) {
            (bool rewardSent, ) = payable(player).call{value: reward}("");
            if (!rewardSent) reward = 0;
        }

        emit BoxOpened(player, play.boxIndex, reward, play.playId);
    }

    /// @notice Adds native USDC to the prize pool; only the owner may fund it.
    /// @dev Reverts with ZeroAmount for a zero payment.
    function addLiquidity() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        emit LiquidityAdded(msg.sender, msg.value);
    }

    /// @notice Withdraws unreserved native USDC from the pool to the current owner.
    /// @dev Reserved maximum payouts cannot be withdrawn. A failed transfer
    /// reverts the withdrawal.
    /// @param amount Positive amount, in 18-decimal native-USDC units.
    function withdrawFunds(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance - reservedLiability) revert InsufficientBalance();

        address recipient = owner();
        (bool sent, ) = payable(recipient).call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit FundsWithdrawn(recipient, amount);
    }

    /// @notice Always reverts; ownership may be transferred but not renounced.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Returns the current native-USDC prize pool.
    /// @return Native balance in 18-decimal USDC units.
    function prizePool() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Returns native USDC not reserved for pending maximum payouts.
    /// @return Unreserved balance in 18-decimal USDC units, saturating at zero.
    function availablePool() external view returns (uint256) {
        uint256 balance = address(this).balance;
        return balance >= reservedLiability ? balance - reservedLiability : 0;
    }
}
