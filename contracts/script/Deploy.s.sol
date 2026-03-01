// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/PredictionMarket.sol";
import "../src/RFQEngine.sol";
import "../src/ParlayEngine.sol";
import "../src/YieldVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envOr("COLLATERAL_TOKEN", address(0));

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock USDC only if not provided
        if (usdc == address(0)) {
            MockUSDC deployed = new MockUSDC();
            usdc = address(deployed);
            console.log("MockUSDC (new):", usdc);
        } else {
            console.log("MockUSDC (existing):", usdc);
        }

        // 2. Deploy PredictionMarket (50 bps = 0.5% fee)
        PredictionMarket market = new PredictionMarket(usdc, 50);
        console.log("PredictionMarket:", address(market));

        // 3. Deploy RFQEngine
        RFQEngine rfq = new RFQEngine(address(market), usdc);
        console.log("RFQEngine:", address(rfq));

        // 4. Deploy ParlayEngine
        ParlayEngine parlay = new ParlayEngine(address(rfq), usdc);
        console.log("ParlayEngine:", address(parlay));

        // 5. Deploy YieldVault
        YieldVault vault = new YieldVault(usdc);
        console.log("YieldVault:", address(vault));

        vm.stopBroadcast();

        console.log("");
        console.log("--- Copy to backend/.env ---");
        console.log(string.concat("COLLATERAL_TOKEN_ADDRESS=", vm.toString(usdc)));
        console.log(string.concat("PREDICTION_MARKET_ADDRESS=", vm.toString(address(market))));
        console.log(string.concat("RFQ_ENGINE_ADDRESS=", vm.toString(address(rfq))));
        console.log(string.concat("PARLAY_ENGINE_ADDRESS=", vm.toString(address(parlay))));
        console.log(string.concat("YIELD_VAULT_ADDRESS=", vm.toString(address(vault))));
    }
}
