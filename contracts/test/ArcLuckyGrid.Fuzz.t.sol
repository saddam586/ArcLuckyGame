// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcLuckyGridTestBase} from "./ArcLuckyGrid.Base.t.sol";
import {ArcLuckyGrid} from "../ArcLuckyGrid.sol";

contract ArcLuckyGridFuzzTest is ArcLuckyGridTestBase {
    function _validPlayer(address p) internal view {
        vm.assume(uint160(p) > 0x10000); // skip precompiles / zero
        vm.assume(p.code.length == 0);
        vm.assume(p != address(game) && p != owner && p != address(this));
        vm.assume(p != address(vm) && p != 0x000000000000000000636F6e736F6c652e6c6f67);
    }

    function testFuzz_RewardAlwaysInAllowedSet(address p, uint8 boxSeed, bytes32 h, uint8 extraBlocks) public {
        _validPlayer(p);
        uint8 box = uint8(bound(boxSeed, 0, 24));
        vm.deal(p, 1 ether);

        uint256 target = _play(p, box);
        uint256 balBefore = p.balance;
        uint256 poolBefore = game.prizePool();

        vm.roll(target + 1 + extraBlocks);
        vm.setBlockhash(target, h);
        uint256 reward = game.settle(p);

        assertTrue(reward == 0 || reward == LOW || reward == MID || reward == HIGH, "reward not in set");
        assertEq(p.balance, balBefore + reward);
        assertEq(game.prizePool(), poolBefore - reward);
        assertEq(game.reservedLiability(), 0);
    }

    function testFuzz_RewardMatchesRollThresholds(address p, uint8 boxSeed, bytes32 h) public {
        _validPlayer(p);
        uint8 box = uint8(bound(boxSeed, 0, 24));
        vm.deal(p, 1 ether);
        _play(p, box);
        (, uint64 playId,,) = game.pending(p);
        uint256 expected = _rewardFromRoll(_rollOf(h, p, box, playId));
        assertEq(_settleAs(stranger, p, h), expected);
    }

    function testFuzz_ExpiredPlayAlwaysPaysZero(address p, uint8 boxSeed, uint16 lateBy) public {
        _validPlayer(p);
        uint8 box = uint8(bound(boxSeed, 0, 24));
        vm.deal(p, 1 ether);
        uint256 target = _play(p, box);
        uint256 balBefore = p.balance;
        vm.roll(target + 257 + uint256(lateBy));
        assertEq(game.settle(p), 0);
        assertEq(p.balance, balBefore);
        assertEq(game.reservedLiability(), 0);
    }

    function testFuzz_WrongFeeAlwaysReverts(uint256 value) public {
        vm.assume(value != FEE);
        value = bound(value, 0, 50 ether);
        vm.assume(value != FEE);
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.WrongEntryFee.selector);
        game.playGame{value: value}(1);
    }

    function testFuzz_InvalidBoxAlwaysReverts(uint8 box) public {
        box = uint8(bound(box, 25, 255));
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.InvalidBox.selector);
        game.playGame{value: FEE}(box);
    }

    function testFuzz_WithdrawNeverExceedsAvailable(uint256 amount, uint8 plays) public {
        plays = uint8(bound(plays, 0, 20));
        for (uint256 i = 0; i < plays; i++) {
            address p = address(uint160(0x100000 + i));
            vm.deal(p, 1 ether);
            _play(p, uint8(i % 25));
        }
        uint256 available = game.availablePool();
        amount = bound(amount, 1, available + 1 ether);
        vm.prank(owner);
        if (amount > available) {
            vm.expectRevert(ArcLuckyGrid.InsufficientBalance.selector);
            game.withdrawFunds(amount);
        } else {
            game.withdrawFunds(amount);
            assertGe(game.prizePool(), game.reservedLiability());
        }
    }

    /// @notice Distribution sanity: average payout per play stays below the 0.0095 retained after fee.
    function test_Distribution_AveragePayoutBelowRetainedFee() public {
        uint256 n = 5000;
        uint256 nPlayers = 25;
        address[] memory players = new address[](nPlayers);
        for (uint256 i = 0; i < nPlayers; i++) {
            players[i] = address(uint160(0x200000 + i));
            vm.deal(players[i], 1000 ether);
        }

        uint256 totalPaid;
        uint256[4] memory counts; // none, low, mid, high
        uint256 startPool = game.prizePool();

        for (uint256 i = 0; i < n; i++) {
            address p = players[i % nPlayers];
            uint256 target = _play(p, uint8(i % 25));
            vm.roll(target + 1);
            vm.setBlockhash(target, keccak256(abi.encode("dist", i)));
            uint256 r = game.settle(p);
            totalPaid += r;
            if (r == 0) counts[0]++;
            else if (r == LOW) counts[1]++;
            else if (r == MID) counts[2]++;
            else if (r == HIGH) counts[3]++;
            else revert("bad reward");
        }

        // average payout per play strictly below 0.0095 ether
        assertLt(totalPaid, n * RETAINED, "avg payout >= 0.0095");
        assertLt(totalPaid / n, RETAINED);
        // pool grew by exactly retained fees minus payouts
        assertEq(game.prizePool(), startPool + n * RETAINED - totalPaid);
        assertGt(game.prizePool(), startPool, "pool should grow on average");
        assertEq(game.reservedLiability(), 0);

        // loose frequency sanity (expected 69.5% / 25% / 4% / 1.5%)
        assertGt(counts[0], n * 65 / 100);
        assertLt(counts[0], n * 74 / 100);
        assertGt(counts[1], n * 21 / 100);
        assertLt(counts[1], n * 29 / 100);
        assertGt(counts[2], n * 2 / 100);
        assertLt(counts[2], n * 6 / 100);
        assertLt(counts[3], n * 3 / 100);
        assertGt(counts[3], 0);
    }
}
