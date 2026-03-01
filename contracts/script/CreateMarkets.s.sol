// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PredictionMarket.sol";

contract CreateMarkets is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address pmAddr = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        PredictionMarket pm = PredictionMarket(pmAddr);

        vm.startBroadcast(deployerKey);

        // Use deployer as oracle for all demo markets
        address oracle = vm.addr(deployerKey);

        // Far-future expiries so markets stay active
        uint256 dec2026 = 1798761600; // 2026-12-31
        uint256 dec2030 = 1924905600; // 2030-12-31
        uint256 dec2035 = 2082758400; // 2035-12-31
        uint256 dec2028 = 1861920000; // 2028-12-31
        // Sports/event markets: use current time + 30 days so expiry is always in the future
        uint256 futureExpiry = block.timestamp + 30 days;

        bytes32 m1 = pm.createMarket("Will Bitcoin exceed $150,000 by December 31, 2026?", dec2026, oracle);
        console.log("Market 1:", vm.toString(m1));

        bytes32 m2 = pm.createMarket("Will Ethereum ETF inflows surpass $50B by end of 2026?", dec2026, oracle);
        console.log("Market 2:", vm.toString(m2));

        bytes32 m3 = pm.createMarket("Will the S&P 500 close above 6000 at any point in 2026?", dec2026, oracle);
        console.log("Market 3:", vm.toString(m3));

        bytes32 m4 = pm.createMarket("Will SpaceX successfully land humans on Mars before 2030?", dec2030, oracle);
        console.log("Market 4:", vm.toString(m4));

        bytes32 m5 = pm.createMarket("Will an AI system win a Nobel Prize before 2035?", dec2035, oracle);
        console.log("Market 5:", vm.toString(m5));

        bytes32 m6 = pm.createMarket("Will a BRICS nation launch a CBDC used by over 100M people by 2028?", dec2028, oracle);
        console.log("Market 6:", vm.toString(m6));

        bytes32 m7 = pm.createMarket("Will the Lakers beat the Warriors in their March 1, 2026 NBA matchup?", futureExpiry, oracle);
        console.log("Market 7:", vm.toString(m7));

        bytes32 m8 = pm.createMarket("Will the 76ers cover the spread vs Celtics on March 1, 2026?", futureExpiry, oracle);
        console.log("Market 8:", vm.toString(m8));

        bytes32 m9 = pm.createMarket("Will Michigan State beat Indiana in their March 1 Big Ten college basketball game?", futureExpiry, oracle);
        console.log("Market 9:", vm.toString(m9));

        bytes32 m10 = pm.createMarket("Will Rangers beat Celtic in the Scottish Premiership on March 1, 2026?", futureExpiry, oracle);
        console.log("Market 10:", vm.toString(m10));

        bytes32 m11 = pm.createMarket("At the Cognizant Classic (PGA), will a top-20 world ranked golfer win the event?", futureExpiry, oracle);
        console.log("Market 11:", vm.toString(m11));

        vm.stopBroadcast();
    }
}
