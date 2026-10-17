require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const { DEPLOYER_PRIVATE_KEY, RSK_TESTNET_RPC_URL } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Sin PUSH0 ni opcodes de Cancun, para que el bytecode corra en Rootstock.
      evmVersion: "paris",
    },
  },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    rskTestnet: {
      url: RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co",
      chainId: 31,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
