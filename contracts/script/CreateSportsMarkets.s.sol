// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PredictionMarket.sol";

contract CreateSportsMarkets is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address pmAddr = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        PredictionMarket pm = PredictionMarket(pmAddr);

        vm.startBroadcast(deployerKey);

        address oracle = vm.addr(deployerKey);
        uint256 expiry = block.timestamp + 30 days;

        bytes32 m7 = pm.createMarket("Will the Lakers beat the Warriors in their March 1, 2026 NBA matchup?", expiry, oracle);
        console.log("Market 7:", vm.toString(m7));

        bytes32 m8 = pm.createMarket("Will the 76ers cover the spread vs Celtics on March 1, 2026?", expiry, oracle);
        console.log("Market 8:", vm.toString(m8));

        bytes32 m9 = pm.createMarket("Will Michigan State beat Indiana in their March 1 Big Ten college basketball game?", expiry, oracle);
        console.log("Market 9:", vm.toString(m9));

        bytes32 m10 = pm.createMarket("Will Rangers beat Celtic in the Scottish Premiership on March 1, 2026?", expiry, oracle);
        console.log("Market 10:", vm.toString(m10));

        bytes32 m11 = pm.createMarket("At the Cognizant Classic (PGA), will a top-20 world ranked golfer win the event?", expiry, oracle);
        console.log("Market 11:", vm.toString(m11));

        vm.stopBroadcast();
    }
}
