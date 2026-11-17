// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcLuckyGridTestBase} from "./ArcLuckyGrid.Base.t.sol";
import {ArcLuckyGrid} from "../ArcLuckyGrid.sol";

contract ArcLuckyGridHandler is Test {
    ArcLuckyGrid public game;
    address public owner;
    address[] public actors;

    uint256 public ghostPlays;
    uint256 public ghostPaid;
    uint256 public ghostWithdrawn;
    uint256 public ghostLiquidity;

    constructor(ArcLuckyGrid _game, address _owner, uint256 initialLiquidity) {
        game = _game;
        owner = _owner;
        ghostLiquidity = initialLiquidity;
        for (uint256 i = 0; i < 4; i++) {
            address a = address(uint160(0x300000 + i));
            vm.deal(a, 1000 ether);
            actors.push(a);
        }
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function play(uint256 actorSeed, uint8 box) external {
        address a = actors[actorSeed % actors.length];
        box = uint8(bound(box, 0, 24));
        (,,, bool exists) = game.pending(a);
        if (exists) return;
        vm.prank(a, a);
        try game.playGame{value: 0.01 ether}(box) {
            ghostPlays++;
        } catch {}
    }

    function settle(uint256 actorSeed, bytes32 h, uint16 extra) external {
        address a = actors[actorSeed % actors.length];
        (uint64 t,,, bool exists) = game.pending(a);
        if (!exists) return;
        uint256 newBlock = uint256(t) + 1 + (extra % 400);
        if (newBlock > block.number) vm.roll(newBlock);
        if (block.number - t <= 256) vm.setBlockhash(t, h);
        ghostPaid += game.settle(a);
    }

    function withdraw(uint256 amount) external {
        uint256 avail = game.availablePool();
        if (avail == 0) return;
        amount = bound(amount, 1, avail);
        vm.prank(owner);
        game.withdrawFunds(amount);
        ghostWithdrawn += amount;
    }

    function addLiquidity(uint256 amount) external {
        amount = bound(amount, 1, 5 ether);
        vm.deal(owner, owner.balance + amount);
        vm.prank(owner);
        game.addLiquidity{value: amount}();
        ghostLiquidity += amount;
    }

    function pendingCount() external view returns (uint256 c) {
        for (uint256 i = 0; i < actors.length; i++) {
            (,,, bool exists) = game.pending(actors[i]);
            if (exists) c++;
        }
    }
}

contract ArcLuckyGridInvariantTest is ArcLuckyGridTestBase {
    ArcLuckyGridHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new ArcLuckyGridHandler(game, owner, SEED_LIQUIDITY);
        targetContract(address(handler));
    }

    /// reserved liability is exactly MAX_REWARD for each pending play
    function invariant_ReservedEqualsPendingTimesMax() public view {
        assertEq(game.reservedLiability(), handler.pendingCount() * HIGH);
    }

    /// the pool always covers every reserved maximum payout
    function invariant_PoolCoversReserved() public view {
        assertGe(game.prizePool(), game.reservedLiability());
    }

    /// conservation: balance = liquidity + retained fees - payouts - withdrawals
    function invariant_BalanceConservation() public view {
        assertEq(
            game.prizePool(),
            handler.ghostLiquidity() + handler.ghostPlays() * RETAINED - handler.ghostPaid() - handler.ghostWithdrawn()
        );
    }

    function invariant_TotalPlaysMatchesGhost() public view {
        assertEq(game.totalPlays(), handler.ghostPlays());
    }
}
