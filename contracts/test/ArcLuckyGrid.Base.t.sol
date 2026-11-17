// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcLuckyGrid} from "../ArcLuckyGrid.sol";

abstract contract ArcLuckyGridTestBase is Test {
    ArcLuckyGrid internal game;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant FEE = 0.01 ether;
    uint256 internal constant OWNER_CUT = 0.0005 ether;
    uint256 internal constant RETAINED = 0.0095 ether;
    uint256 internal constant LOW = 0.02 ether;
    uint256 internal constant MID = 0.05 ether;
    uint256 internal constant HIGH = 0.10 ether;
    uint256 internal constant SEED_LIQUIDITY = 10 ether;

    // Reward tiers for _hashFor
    uint256 internal constant T_NONE = 0;
    uint256 internal constant T_LOW = 1;
    uint256 internal constant T_MID = 2;
    uint256 internal constant T_HIGH = 3;

    function setUp() public virtual {
        game = new ArcLuckyGrid(owner);
        vm.deal(owner, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(stranger, 100 ether);
        vm.prank(owner);
        game.addLiquidity{value: SEED_LIQUIDITY}();
    }

    /// @dev Commit a play from an EOA-like `p` (msg.sender == tx.origin).
    function _play(address p, uint8 box) internal returns (uint256 target) {
        vm.prank(p, p);
        game.playGame{value: FEE}(box);
        (uint64 t,,,) = game.pending(p);
        target = t;
    }

    /// @dev Replicates the contract's roll to map a roll value to a reward.
    function _rewardFromRoll(uint256 roll) internal pure returns (uint256) {
        if (roll < 150) return HIGH;
        if (roll < 550) return MID;
        if (roll < 3_050) return LOW;
        return 0;
    }

    function _rollOf(bytes32 h, address p, uint8 box, uint64 playId) internal view returns (uint256) {
        return uint256(keccak256(abi.encode(h, p, box, playId, address(game)))) % 10_000;
    }

    /// @dev Find a block hash that yields the desired reward tier for p's pending play.
    function _hashFor(address p, uint256 tier) internal view returns (bytes32) {
        (, uint64 playId, uint8 box,) = game.pending(p);
        uint256 want = tier == T_HIGH ? HIGH : tier == T_MID ? MID : tier == T_LOW ? LOW : 0;
        for (uint256 i = 1; i < 200_000; i++) {
            bytes32 h = keccak256(abi.encode("seed", i));
            if (_rewardFromRoll(_rollOf(h, p, box, playId)) == want) return h;
        }
        revert("no seed found");
    }

    /// @dev Advance past the target block, pin blockhash(target)=h, settle as `caller`.
    function _settleAs(address caller, address p, bytes32 h) internal returns (uint256 reward) {
        (uint64 t,,,) = game.pending(p);
        if (block.number <= t) vm.roll(uint256(t) + 1);
        vm.setBlockhash(uint256(t), h);
        vm.prank(caller);
        reward = game.settle(p);
    }
}
