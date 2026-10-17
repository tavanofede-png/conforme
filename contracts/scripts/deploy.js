const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

const MINT_TUSD = process.env.MINT_TUSD || "1000000";
const BUYER_GAS_TOPUP = process.env.BUYER_GAS_TOPUP || "0.0003";

async function resolveBuyer(signers) {
  if (network.name === "hardhat" || network.name === "localhost") return signers[1].address;
  if (process.env.BUYER_ADDRESS) return ethers.getAddress(process.env.BUYER_ADDRESS);
  if (process.env.BUYER_PRIVATE_KEY) return new ethers.Wallet(process.env.BUYER_PRIVATE_KEY).address;
  throw new Error("Falta BUYER_PRIVATE_KEY o BUYER_ADDRESS para la billetera del importador.");
}

/** El proveedor solo recibe fondos, así que alcanza con una dirección. */
function resolveSeller(signers) {
  if (network.name === "hardhat" || network.name === "localhost") return signers[2].address;
  if (process.env.SELLER_ADDRESS) return ethers.getAddress(process.env.SELLER_ADDRESS);
  return ethers.Wallet.createRandom().address;
}

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("Falta DEPLOYER_PRIVATE_KEY: es la billetera que despliega y actúa como árbitro.");
  }
  const deployer = signers[0];
  const buyer = await resolveBuyer(signers);
  const seller = resolveSeller(signers);
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`Red: ${network.name} (chainId ${chainId})`);
  console.log(`Árbitro / deployer: ${deployer.address}`);
  console.log(`Importador: ${buyer}`);
  console.log(`Proveedor: ${seller}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Saldo del deployer: ${ethers.formatEther(balance)}`);

  const token = await ethers.deployContract("TestUSD", [deployer.address]);
  await token.waitForDeployment();
  console.log(`TestUSD: ${await token.getAddress()}`);

  const escrow = await ethers.deployContract("ConformeEscrow", [deployer.address]);
  await escrow.waitForDeployment();
  console.log(`ConformeEscrow: ${await escrow.getAddress()}`);

  await (await token.mint(buyer, ethers.parseUnits(MINT_TUSD, 6))).wait();
  console.log(`Acuñados ${MINT_TUSD} tUSD para el importador`);

  const isLocal = network.name === "hardhat" || network.name === "localhost";
  if (!isLocal) {
    const topup = ethers.parseEther(BUYER_GAS_TOPUP);
    const buyerBalance = await ethers.provider.getBalance(buyer);
    if (buyerBalance < topup) {
      await (await deployer.sendTransaction({ to: buyer, value: topup })).wait();
      console.log(`Enviado ${BUYER_GAS_TOPUP} para gas al importador`);
    }
  }

  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    escrow: await escrow.getAddress(),
    token: await token.getAddress(),
    arbiter: deployer.address,
    buyer,
    seller,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.resolve(__dirname, "../../web/deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`Direcciones guardadas en ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
