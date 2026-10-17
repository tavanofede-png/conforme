const { Wallet } = require("ethers");

// Billeteras descartables para Rootstock Testnet. No las uses para fondos reales.
const deployer = Wallet.createRandom();
const buyer = Wallet.createRandom();

console.log("# Pegá esto en conforme/contracts/.env");
console.log(`DEPLOYER_PRIVATE_KEY=${deployer.privateKey}`);
console.log(`BUYER_PRIVATE_KEY=${buyer.privateKey}`);
console.log("");
console.log("# Y esto en conforme/web/.env.local");
console.log("CHAIN_NETWORK=rskTestnet");
console.log(`ARBITER_PRIVATE_KEY=${deployer.privateKey}`);
console.log(`BUYER_PRIVATE_KEY=${buyer.privateKey}`);
console.log("");
console.log(`Cargá tRBTC en ${deployer.address} desde https://faucet.rootstock.io`);
