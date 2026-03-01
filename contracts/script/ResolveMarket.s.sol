// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PredictionMarket.sol";
import "../src/interfaces/IPredictionMarket.sol";

/**
 * Resolves a single market by calling PredictionMarket.resolveMarket(bytes32 marketId, Outcome outcome).
 * Only the market's oracle can resolve; the broadcaster must be that oracle.
 *
 * Usage:
 *   MARKET_ID=0x<64 hex chars> [OUTCOME=1] forge script script/ResolveMarket.s.sol --rpc-url <RPC> --broadcast
 *
 * Env:
 *   MARKET_ID   (required) Market id as 0x-prefixed hex (bytes32).
 *   OUTCOME     (optional) 1 = Yes, 2 = No. Default: 1.
 *   DEPLOYER_PRIVATE_KEY   Oracle private key (must be the market's oracle).
 *   PREDICTION_MARKET_ADDRESS  PredictionMarket contract address.
 */
contract ResolveMarket is Script {
    function run() external {
        string memory marketIdHex = vm.envString("MARKET_ID");
        bytes32 marketId = vm.parseBytes32(marketIdHex);
        uint256 outcomeNum = vm.envOr("OUTCOME", uint256(1));
        require(outcomeNum == 1 || outcomeNum == 2, "OUTCOME must be 1 (Yes) or 2 (No)");

        uint256 oracleKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address pmAddr = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        PredictionMarket pm = PredictionMarket(pmAddr);

        IPredictionMarket.Outcome outcome = outcomeNum == 1
            ? IPredictionMarket.Outcome.Yes
            : IPredictionMarket.Outcome.No;

        vm.startBroadcast(oracleKey);
        // PredictionMarket.resolveMarket: sets status = Resolved, outcome = Yes|No, emits MarketResolved
        pm.resolveMarket(marketId, outcome);
        vm.stopBroadcast();

        console.log("Resolved market", vm.toString(marketId), outcomeNum == 1 ? "Yes" : "No");
    }
}
