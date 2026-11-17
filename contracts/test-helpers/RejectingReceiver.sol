// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Test helper: rejects every native-currency transfer. Its runtime code is
/// etched at EOA-like addresses to exercise failed-payout branches.
contract RejectingReceiver {
    receive() external payable {
        revert("rejected");
    }

    fallback() external payable {
        revert("rejected");
    }
}
