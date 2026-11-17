// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcLuckyGridTestBase} from "./ArcLuckyGrid.Base.t.sol";
import {ArcLuckyGrid} from "../ArcLuckyGrid.sol";

contract ArcLuckyGridCoreTest is ArcLuckyGridTestBase {
    // ---------------- deployment ----------------

    function test_Deploy_InitialState() public view {
        assertEq(game.owner(), owner);
        assertEq(game.totalPlays(), 0);
        assertEq(game.reservedLiability(), 0);
        assertEq(game.prizePool(), SEED_LIQUIDITY);
        assertEq(game.availablePool(), SEED_LIQUIDITY);
        assertEq(game.ENTRY_FEE(), FEE);
        assertEq(game.GRID_SIZE(), 25);
    }

    // ---------------- playGame ----------------

    function test_PlayGame_CommitsPendingPlayAndReserves() public {
        uint256 ownerBefore = owner.balance;
        uint256 poolBefore = game.prizePool();
        uint256 target = _play(alice, 7);

        (uint64 t, uint64 playId, uint8 box, bool exists) = game.pending(alice);
        assertEq(uint256(t), block.number + 1);
        assertEq(target, block.number + 1);
        assertEq(playId, 1);
        assertEq(box, 7);
        assertTrue(exists);
        assertEq(game.totalPlays(), 1);
        assertEq(game.reservedLiability(), HIGH);
        // 5% goes to owner, 95% stays in the pool
        assertEq(owner.balance, ownerBefore + OWNER_CUT);
        assertEq(game.prizePool(), poolBefore + RETAINED);
        assertEq(game.availablePool(), poolBefore + RETAINED - HIGH);
    }

    function test_PlayGame_EmitsBoxCommitted() public {
        vm.expectEmit(true, true, false, true, address(game));
        emit ArcLuckyGrid.BoxCommitted(alice, 24, 1, block.number + 1);
        vm.prank(alice, alice);
        game.playGame{value: FEE}(24);
    }

    function test_PlayGame_AcceptsEveryBoxBoundary() public {
        _play(alice, 0);
        _play(bob, 24);
        assertEq(game.totalPlays(), 2);
    }

    function test_PlayGame_RevertsInvalidBox() public {
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.InvalidBox.selector);
        game.playGame{value: FEE}(25);

        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.InvalidBox.selector);
        game.playGame{value: FEE}(255);
    }

    function test_PlayGame_RevertsWrongEntryFee() public {
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.WrongEntryFee.selector);
        game.playGame{value: FEE - 1}(1);

        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.WrongEntryFee.selector);
        game.playGame{value: FEE + 1}(1);

        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.WrongEntryFee.selector);
        game.playGame(1);
    }

    function test_PlayGame_RevertsContractCaller() public {
        // msg.sender (alice) != tx.origin (default test origin)
        vm.prank(alice);
        vm.expectRevert(ArcLuckyGrid.ContractsNotAllowed.selector);
        game.playGame{value: FEE}(1);
    }

    function test_PlayGame_RevertsWhenPlayPending() public {
        _play(alice, 1);
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.PlayPending.selector);
        game.playGame{value: FEE}(2);
    }

    function test_PlayGame_OnePendingPerPlayerNotGlobal() public {
        _play(alice, 1);
        _play(bob, 1);
        assertEq(game.reservedLiability(), 2 * HIGH);
        assertEq(game.totalPlays(), 2);
    }

    function test_PlayGame_CanReplayAfterSettle() public {
        _play(alice, 1);
        _settleAs(alice, alice, _hashFor(alice, T_NONE));
        _play(alice, 2);
        (, uint64 playId,,) = game.pending(alice);
        assertEq(playId, 2);
    }

    // ---------------- settle ----------------

    function test_Settle_RevertsNoPendingPlay() public {
        vm.expectRevert(ArcLuckyGrid.NoPendingPlay.selector);
        game.settle(alice);
    }

    function test_Settle_RevertsTooEarly() public {
        uint256 target = _play(alice, 3);
        // same block as commit
        vm.expectRevert(ArcLuckyGrid.TooEarly.selector);
        game.settle(alice);
        // block == targetBlock is still too early
        vm.roll(target);
        vm.expectRevert(ArcLuckyGrid.TooEarly.selector);
        game.settle(alice);
        // target + 1 works
        vm.roll(target + 1);
        game.settle(alice);
    }

    function test_Settle_RevertsSecondTime() public {
        _play(alice, 3);
        _settleAs(alice, alice, _hashFor(alice, T_NONE));
        vm.expectRevert(ArcLuckyGrid.NoPendingPlay.selector);
        game.settle(alice);
    }

    function _checkTier(uint256 tier, uint256 expected) internal {
        _play(alice, 12);
        bytes32 h = _hashFor(alice, tier);
        uint256 aliceBefore = alice.balance;
        uint256 poolBefore = game.prizePool();

        (uint64 t, uint64 playId,,) = game.pending(alice);
        vm.roll(uint256(t) + 1);
        vm.setBlockhash(uint256(t), h);
        vm.expectEmit(true, true, false, true, address(game));
        emit ArcLuckyGrid.BoxOpened(alice, 12, expected, playId);
        uint256 reward = game.settle(alice);

        assertEq(reward, expected);
        assertEq(alice.balance, aliceBefore + expected);
        assertEq(game.prizePool(), poolBefore - expected);
        assertEq(game.reservedLiability(), 0);
        (,,, bool exists) = game.pending(alice);
        assertFalse(exists);
    }

    function test_Settle_NoReward() public {
        _checkTier(T_NONE, 0);
    }

    function test_Settle_LowReward() public {
        _checkTier(T_LOW, LOW);
    }

    function test_Settle_MidReward() public {
        _checkTier(T_MID, MID);
    }

    function test_Settle_HighReward() public {
        _checkTier(T_HIGH, HIGH);
    }

    function test_Settle_AnyoneCanSettleForPlayer() public {
        _play(alice, 4);
        bytes32 h = _hashFor(alice, T_MID);
        uint256 aliceBefore = alice.balance;
        uint256 strangerBefore = stranger.balance;
        uint256 reward = _settleAs(stranger, alice, h);
        assertEq(reward, MID);
        assertEq(alice.balance, aliceBefore + MID);
        assertEq(stranger.balance, strangerBefore);
        assertEq(game.reservedLiability(), 0);
    }

    function test_Settle_OutcomeDependsOnPlayerBoxAndId() public {
        // Same block hash yields the formula result for each player independently.
        _play(alice, 4);
        _play(bob, 9);
        bytes32 h = keccak256("shared");
        (, uint64 aid, uint8 abox,) = game.pending(alice);
        (, uint64 bid, uint8 bbox,) = game.pending(bob);
        uint256 expA = _rewardFromRoll(_rollOf(h, alice, abox, aid));
        uint256 expB = _rewardFromRoll(_rollOf(h, bob, bbox, bid));
        (uint64 t,,,) = game.pending(alice);
        vm.roll(uint256(t) + 1);
        vm.setBlockhash(uint256(t), h);
        assertEq(game.settle(alice), expA);
        assertEq(game.settle(bob), expB);
    }

    // ---------------- 256-block expiry ----------------

    function test_Expiry_StillSettlesAtLastWindowBlock() public {
        uint256 target = _play(alice, 5);
        bytes32 h = _hashFor(alice, T_HIGH);
        vm.roll(target + 256); // blockhash(target) still available (number - 256 <= target)
        vm.setBlockhash(target, h);
        assertEq(game.settle(alice), HIGH);
    }

    function test_Expiry_ForfeitsAfter256Blocks() public {
        uint256 target = _play(alice, 5);
        uint256 aliceBefore = alice.balance;
        uint256 poolBefore = game.prizePool();
        vm.roll(target + 257); // blockhash(target) == 0 now
        assertEq(blockhash(target), bytes32(0));

        (, uint64 playId,,) = game.pending(alice);
        vm.expectEmit(true, true, false, true, address(game));
        emit ArcLuckyGrid.BoxOpened(alice, 5, 0, playId);
        uint256 reward = game.settle(alice);

        assertEq(reward, 0);
        assertEq(alice.balance, aliceBefore);
        assertEq(game.prizePool(), poolBefore);
        assertEq(game.reservedLiability(), 0);
        (,,, bool exists) = game.pending(alice);
        assertFalse(exists);
        // player can start a new play afterwards
        _play(alice, 6);
    }

    // ---------------- reserved liability & PoolTooLow ----------------

    function test_Reserved_AccumulatesAndReleases() public {
        _play(alice, 1);
        _play(bob, 2);
        assertEq(game.reservedLiability(), 2 * HIGH);
        _settleAs(stranger, alice, _hashFor(alice, T_NONE));
        assertEq(game.reservedLiability(), HIGH);
        _settleAs(stranger, bob, _hashFor(bob, T_NONE));
        assertEq(game.reservedLiability(), 0);
    }

    function test_PoolTooLow_EmptyPool() public {
        ArcLuckyGrid g = new ArcLuckyGrid(owner);
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.PoolTooLow.selector);
        g.playGame{value: FEE}(1);
        assertEq(g.totalPlays(), 0);
        assertEq(g.reservedLiability(), 0);
    }

    function test_PoolTooLow_ExactBoundary() public {
        ArcLuckyGrid g = new ArcLuckyGrid(owner);
        uint256 needed = HIGH - RETAINED; // pool such that post-fee balance == MAX_REWARD

        vm.prank(owner);
        g.addLiquidity{value: needed - 1}();
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.PoolTooLow.selector);
        g.playGame{value: FEE}(1);

        vm.prank(owner);
        g.addLiquidity{value: 1}();
        vm.prank(alice, alice);
        g.playGame{value: FEE}(1);
        assertEq(g.reservedLiability(), HIGH);
        assertEq(g.prizePool(), HIGH);

        // Second concurrent play cannot be covered
        vm.prank(bob, bob);
        vm.expectRevert(ArcLuckyGrid.PoolTooLow.selector);
        g.playGame{value: FEE}(1);
    }

    function test_PoolTooLow_ClearsAfterSettlement() public {
        ArcLuckyGrid g = new ArcLuckyGrid(owner);
        vm.prank(owner);
        g.addLiquidity{value: HIGH - RETAINED}();
        vm.prank(alice, alice);
        g.playGame{value: FEE}(1);
        vm.prank(bob, bob);
        vm.expectRevert(ArcLuckyGrid.PoolTooLow.selector);
        g.playGame{value: FEE}(1);

        vm.roll(block.number + 2); // blockhash is non-zero for rolled-over blocks; any outcome fine
        g.settle(alice);
        assertEq(g.reservedLiability(), 0);
    }

    function test_AvailablePool_SaturatesAtZero() public {
        _play(alice, 1);
        vm.deal(address(game), HIGH / 2);
        assertEq(game.availablePool(), 0);
    }
}
