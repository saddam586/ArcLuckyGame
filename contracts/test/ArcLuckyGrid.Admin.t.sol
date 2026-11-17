// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ArcLuckyGridTestBase} from "./ArcLuckyGrid.Base.t.sol";
import {ArcLuckyGrid} from "../ArcLuckyGrid.sol";
import {RejectingReceiver} from "../test-helpers/RejectingReceiver.sol";

contract ArcLuckyGridAdminTest is ArcLuckyGridTestBase {
    function _etchRejecter(string memory label) internal returns (address a) {
        a = makeAddr(label);
        vm.etch(a, address(new RejectingReceiver()).code);
        vm.deal(a, 100 ether);
    }

    // ---------------- addLiquidity ----------------

    function test_AddLiquidity_OwnerFundsPoolAndEmits() public {
        uint256 before = game.prizePool();
        vm.expectEmit(true, false, false, true, address(game));
        emit ArcLuckyGrid.LiquidityAdded(owner, 3 ether);
        vm.prank(owner);
        game.addLiquidity{value: 3 ether}();
        assertEq(game.prizePool(), before + 3 ether);
    }

    function test_AddLiquidity_RevertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        game.addLiquidity{value: 1 ether}();
    }

    function test_AddLiquidity_RevertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(ArcLuckyGrid.ZeroAmount.selector);
        game.addLiquidity();
    }

    function test_NoReceiveOrFallback_StrayPaymentsRevert() public {
        vm.prank(alice);
        (bool ok,) = address(game).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ---------------- withdrawFunds ----------------

    function test_Withdraw_OwnerWithdrawsAndEmits() public {
        uint256 ownerBefore = owner.balance;
        vm.expectEmit(true, false, false, true, address(game));
        emit ArcLuckyGrid.FundsWithdrawn(owner, 4 ether);
        vm.prank(owner);
        game.withdrawFunds(4 ether);
        assertEq(owner.balance, ownerBefore + 4 ether);
        assertEq(game.prizePool(), SEED_LIQUIDITY - 4 ether);
    }

    function test_Withdraw_RevertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        game.withdrawFunds(1 ether);
    }

    function test_Withdraw_RevertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(ArcLuckyGrid.ZeroAmount.selector);
        game.withdrawFunds(0);
    }

    function test_Withdraw_RevertsAbovePool() public {
        vm.prank(owner);
        vm.expectRevert(ArcLuckyGrid.InsufficientBalance.selector);
        game.withdrawFunds(SEED_LIQUIDITY + 1);
    }

    function test_Withdraw_CannotTouchReservedLiability() public {
        _play(alice, 1);
        _play(bob, 2);
        uint256 available = game.availablePool();
        assertEq(available, SEED_LIQUIDITY + 2 * RETAINED - 2 * HIGH);

        vm.prank(owner);
        vm.expectRevert(ArcLuckyGrid.InsufficientBalance.selector);
        game.withdrawFunds(available + 1);

        vm.prank(owner);
        game.withdrawFunds(available);
        assertEq(game.prizePool(), 2 * HIGH);
        assertEq(game.availablePool(), 0);

        // reserved funds can still pay out the maximum prize
        uint256 reward = _settleAs(stranger, alice, _hashFor(alice, T_HIGH));
        assertEq(reward, HIGH);
        reward = _settleAs(stranger, bob, _hashFor(bob, T_HIGH));
        assertEq(reward, HIGH);
        assertEq(game.prizePool(), 0);
    }

    function test_Withdraw_ReleasedAfterSettle() public {
        _play(alice, 1);
        _settleAs(stranger, alice, _hashFor(alice, T_NONE));
        uint256 all = game.prizePool();
        assertEq(game.availablePool(), all);
        vm.prank(owner);
        game.withdrawFunds(all);
        assertEq(game.prizePool(), 0);
    }

    // ---------------- ownership ----------------

    function test_RenounceOwnership_AlwaysReverts() public {
        vm.prank(owner);
        vm.expectRevert(ArcLuckyGrid.RenounceDisabled.selector);
        game.renounceOwnership();

        vm.prank(alice);
        vm.expectRevert(ArcLuckyGrid.RenounceDisabled.selector);
        game.renounceOwnership();
        assertEq(game.owner(), owner);
    }

    function test_TransferOwnership_NewOwnerReceivesFees() public {
        vm.prank(owner);
        game.transferOwnership(bob);
        uint256 bobBefore = bob.balance;
        _play(alice, 1);
        assertEq(bob.balance, bobBefore + OWNER_CUT);
    }

    // ---------------- failing transfers ----------------

    function test_FailedPayout_DoesNotLockLiquidity() public {
        address rej = _etchRejecter("rejectingPlayer");
        assertGt(rej.code.length, 0);

        // tx.origin == msg.sender == rej, so ContractsNotAllowed is not triggered
        uint256 target = _play(rej, 3);
        bytes32 h = _hashFor(rej, T_HIGH);
        uint256 poolBefore = game.prizePool();
        uint256 rejBefore = rej.balance;

        (, uint64 playId,,) = game.pending(rej);
        vm.roll(target + 1);
        vm.setBlockhash(target, h);
        vm.expectEmit(true, true, false, true, address(game));
        emit ArcLuckyGrid.BoxOpened(rej, 3, 0, playId); // reported as 0: nothing actually paid
        uint256 reward = game.settle(rej);

        assertEq(reward, 0);
        assertEq(rej.balance, rejBefore);
        assertEq(game.prizePool(), poolBefore); // prize stays in the pool
        assertEq(game.reservedLiability(), 0); // liability released
        (,,, bool exists) = game.pending(rej);
        assertFalse(exists);

        // liquidity is fully withdrawable by the owner
        uint256 all = game.availablePool();
        assertEq(all, poolBefore);
        vm.prank(owner);
        game.withdrawFunds(all);
        assertEq(game.prizePool(), 0);
    }

    function test_FailedPayout_PlayerCanPlayAgainAndOthersUnaffected() public {
        address rej = _etchRejecter("rejectingPlayer2");
        _play(rej, 1);
        _play(alice, 1);
        _settleAs(stranger, rej, _hashFor(rej, T_MID));
        _play(rej, 2); // not stuck
        assertEq(_settleAs(stranger, alice, _hashFor(alice, T_LOW)), LOW);
    }

    function test_FeeTransferFailure_RevertsPlay() public {
        address rejOwner = _etchRejecter("rejectingOwner");
        ArcLuckyGrid g = new ArcLuckyGrid(rejOwner);
        vm.deal(address(g), 10 ether);
        vm.prank(alice, alice);
        vm.expectRevert(ArcLuckyGrid.TransferFailed.selector);
        g.playGame{value: FEE}(1);
        assertEq(g.totalPlays(), 0);
        assertEq(g.reservedLiability(), 0);
        (,,, bool exists) = g.pending(alice);
        assertFalse(exists);
    }

    function test_Withdraw_RevertsWhenOwnerRejectsPayment() public {
        address rejOwner = _etchRejecter("rejectingOwner2");
        ArcLuckyGrid g = new ArcLuckyGrid(rejOwner);
        vm.deal(address(g), 10 ether);
        vm.prank(rejOwner);
        vm.expectRevert(ArcLuckyGrid.TransferFailed.selector);
        g.withdrawFunds(1 ether);
        assertEq(address(g).balance, 10 ether);
    }
}
