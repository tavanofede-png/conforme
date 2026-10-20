import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits, parseUnits } from "ethers";
import { DOC_KINDS, type Operation } from "./domain";
import { addDays } from "./normalize";

export const NETWORKS = {
  localhost: {
    label: "Nodo local (Hardhat)",
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    explorer: null,
    gasSymbol: "ETH",
  },
  rskTestnet: {
    label: "Rootstock Testnet",
    chainId: 31,
    rpcUrl: "https://public-node.testnet.rsk.co",
    explorer: "https://explorer.testnet.rootstock.io",
    gasSymbol: "tRBTC",
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;

/** Cuentas públicas de prueba que trae `npx hardhat node`. Solo se usan contra el nodo local. */
const HARDHAT = {
  arbiterKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  buyerKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  seller: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
};

const ESCROW_ABI = [
  "function arbiter() view returns (address)",
  "function deals(bytes32) view returns (address buyer, address seller, address token, uint256 amount, uint64 deadline, uint8 status, bytes32 docsHash)",
  "function fund(bytes32 dealId, address seller, address token, uint256 amount, uint64 deadline)",
  "function release(bytes32 dealId, bytes32 docsHash)",
  "function refund(bytes32 dealId)",
  "error InvalidParams()",
  "error DealExists()",
  "error NotFunded()",
  "error NotArbiter()",
  "error NotAllowed()",
];

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const DEAL_STATUS = ["sin-fondos", "en-custodia", "liberado", "devuelto"] as const;

interface Deployment {
  network: string;
  chainId: number;
  escrow: string;
  token: string;
  arbiter: string;
  buyer: string;
  seller?: string;
  deployedAt: string;
}

export class ChainError extends Error {}

async function loadDeployment(network: NetworkName): Promise<Deployment | null> {
  try {
    const file = path.join(process.cwd(), "deployments", `${network}.json`);
    return JSON.parse(await fs.readFile(file, "utf8")) as Deployment;
  } catch {
    return null;
  }
}

async function setup() {
  const network = (process.env.CHAIN_NETWORK ?? "localhost") as NetworkName;
  if (!(network in NETWORKS)) throw new ChainError(`CHAIN_NETWORK tiene que ser "localhost" o "rskTestnet", no "${network}".`);
  const meta = NETWORKS[network];
  const local = network === "localhost";
  const deployment = await loadDeployment(network);
  return {
    network,
    meta,
    rpcUrl: process.env.CHAIN_RPC_URL ?? meta.rpcUrl,
    deployment,
    arbiterKey: process.env.ARBITER_PRIVATE_KEY ?? (local ? HARDHAT.arbiterKey : undefined),
    buyerKey: process.env.BUYER_PRIVATE_KEY ?? (local ? HARDHAT.buyerKey : undefined),
    seller: process.env.SELLER_ADDRESS ?? deployment?.seller ?? (local ? HARDHAT.seller : undefined),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function configProblem(s: Setup): string | null {
  const deployCmd = `npx hardhat run scripts/deploy.js --network ${s.network}`;
  if (!s.deployment) return `No encontramos los contratos desplegados en ${s.meta.label}. Corré \`${deployCmd}\` en conforme/contracts.`;
  if (!s.arbiterKey) return "Falta ARBITER_PRIVATE_KEY (la billetera que verifica y libera los pagos).";
  if (!s.buyerKey) return "Falta BUYER_PRIVATE_KEY (la billetera del importador en la demo).";
  if (!s.seller) return "Falta SELLER_ADDRESS (la dirección del proveedor).";
  return null;
}

function connect(s: Setup) {
  const problem = configProblem(s);
  if (problem) throw new ChainError(problem);
  const provider = new JsonRpcProvider(s.rpcUrl, s.meta.chainId, { staticNetwork: true });
  const arbiter = new Wallet(s.arbiterKey!, provider);
  const buyer = new Wallet(s.buyerKey!, provider);
  const { escrow, token } = s.deployment!;
  return {
    provider,
    arbiter,
    buyer,
    seller: s.seller!,
    escrowAddress: escrow,
    tokenAddress: token,
    escrowRead: new Contract(escrow, ESCROW_ABI, provider),
    escrowAsBuyer: new Contract(escrow, ESCROW_ABI, buyer),
    escrowAsArbiter: new Contract(escrow, ESCROW_ABI, arbiter),
    tokenRead: new Contract(token, TOKEN_ABI, provider),
    tokenAsBuyer: new Contract(token, TOKEN_ABI, buyer),
  };
}

/** Traduce los errores de ethers a algo que se pueda mostrar en pantalla. */
export function explainChainError(err: unknown, network: string = process.env.CHAIN_NETWORK ?? "localhost"): string {
  if (err instanceof ChainError) return err.message;
  const e = err as { code?: string; shortMessage?: string; message?: string; revert?: { name?: string } };
  const text = `${e.shortMessage ?? ""} ${e.message ?? ""}`;
  if (e.revert?.name) {
    const reasons: Record<string, string> = {
      DealExists: "Esta operación ya tiene fondos en el contrato.",
      NotFunded: "El contrato no tiene fondos en custodia para esta operación.",
      NotArbiter: "La billetera que intenta liberar no es el árbitro del contrato.",
      NotAllowed: "El importador solo puede recuperar los fondos después del plazo.",
      InvalidParams: "El contrato rechazó los datos de la operación.",
    };
    return reasons[e.revert.name] ?? `El contrato rechazó la operación (${e.revert.name}).`;
  }
  if (/ECONNREFUSED|failed to detect network|fetch failed|ENOTFOUND|timeout/i.test(text)) {
    return network === "localhost"
      ? "No hay conexión con el nodo local. ¿Está corriendo `npx hardhat node` en conforme/contracts?"
      : "No hay conexión con el nodo de Rootstock. Revisá CHAIN_RPC_URL o probá en un rato.";
  }
  if (e.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(text)) {
    return network === "localhost"
      ? "La billetera no tiene saldo para pagar el gas."
      : "La billetera no tiene tRBTC para el gas. Pedí en https://faucet.rootstock.io";
  }
  return e.shortMessage ?? e.message ?? String(err);
}

export function txUrl(network: string | undefined, hash: string | undefined): string | null {
  if (!hash || !network) return null;
  const explorer = NETWORKS[network as NetworkName]?.explorer;
  return explorer ? `${explorer}/tx/${hash}` : null;
}

export function addressUrl(network: string | undefined, address: string | undefined): string | null {
  if (!address || !network) return null;
  const explorer = NETWORKS[network as NetworkName]?.explorer;
  return explorer ? `${explorer}/address/${address}` : null;
}

/** Huella del juego de documentos aprobado: sha256 de las huellas de cada archivo, en orden fijo. */
export function docsHashOf(op: Operation): string {
  const joined = DOC_KINDS.map((k) => `${k}:${op.documents[k]?.sha256 ?? ""}`).join("|");
  return `0x${createHash("sha256").update(joined).digest("hex")}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function getChainInfo() {
  const s = await setup();
  const base = {
    network: s.network,
    label: s.meta.label,
    chainId: s.meta.chainId,
    gasSymbol: s.meta.gasSymbol,
    explorer: s.meta.explorer,
    escrow: s.deployment?.escrow ?? null,
    token: s.deployment?.token ?? null,
    escrowUrl: addressUrl(s.network, s.deployment?.escrow),
    seller: s.seller ?? null,
  };
  const problem = configProblem(s);
  if (problem) return { ...base, ready: false as const, problem };

  try {
    const c = connect(s);
    const [decimals, symbol, arbiterOnChain] = await withTimeout(
      Promise.all([c.tokenRead.decimals(), c.tokenRead.symbol(), c.escrowRead.arbiter()]),
      8000,
    );
    const [buyerToken, sellerToken, escrowToken, buyerGas, arbiterGas] = await withTimeout(
      Promise.all([
        c.tokenRead.balanceOf(c.buyer.address),
        c.tokenRead.balanceOf(c.seller),
        c.tokenRead.balanceOf(c.escrowAddress),
        c.provider.getBalance(c.buyer.address),
        c.provider.getBalance(c.arbiter.address),
      ]),
      8000,
    );
    const fmt = (v: bigint) => formatUnits(v, Number(decimals));
    const arbiterMatches = String(arbiterOnChain).toLowerCase() === c.arbiter.address.toLowerCase();
    return {
      ...base,
      ready: arbiterMatches,
      problem: arbiterMatches ? null : "ARBITER_PRIVATE_KEY no corresponde al árbitro del contrato desplegado.",
      symbol: String(symbol),
      arbiter: c.arbiter.address,
      buyer: c.buyer.address,
      balances: {
        buyer: fmt(buyerToken),
        seller: fmt(sellerToken),
        escrow: fmt(escrowToken),
        buyerGas: formatEther(buyerGas),
        arbiterGas: formatEther(arbiterGas),
      },
    };
  } catch (err) {
    return { ...base, ready: false as const, problem: explainChainError(err, s.network) };
  }
}

export type ChainInfo = Awaited<ReturnType<typeof getChainInfo>>;

export async function readDeal(dealId: string) {
  const c = connect(await setup());
  const deal = await c.escrowRead.deals(dealId);
  return { status: DEAL_STATUS[Number(deal.status)] ?? "sin-fondos", amount: deal.amount as bigint };
}

/** Datos públicos para que el importador firme el depósito desde su billetera. */
export async function fundParameters(op: Operation) {
  const s = await setup();
  const problem = configProblem(s);
  if (problem) throw new ChainError(problem);
  const c = connect(s);
  const decimals = Number(await c.tokenRead.decimals());
  const amount = parseUnits(op.po.amount.toFixed(decimals), decimals);
  const byShipment = Date.parse(`${addDays(op.po.latestShipmentDate, 30)}T23:59:59Z`);
  const deadline = Math.floor(Math.max(byShipment, Date.now() + 7 * 86_400_000) / 1000);
  return {
    chainId: s.meta.chainId,
    chainName: s.meta.label,
    rpcUrl: s.rpcUrl,
    gasSymbol: s.meta.gasSymbol,
    explorer: s.meta.explorer,
    escrow: c.escrowAddress,
    token: c.tokenAddress,
    seller: c.seller,
    dealId: op.escrow.dealId,
    amount: amount.toString(),
    deadline,
  };
}

export async function fundDeal(op: Operation) {
  const s = await setup();
  const c = connect(s);
  const decimals = Number(await c.tokenRead.decimals());
  const amount = parseUnits(op.po.amount.toFixed(decimals), decimals);

  const balance: bigint = await c.tokenRead.balanceOf(c.buyer.address);
  if (balance < amount) {
    throw new ChainError(`El importador tiene ${formatUnits(balance, decimals)} tUSD y la operación necesita ${formatUnits(amount, decimals)}.`);
  }
  const existing = await c.escrowRead.deals(op.escrow.dealId);
  if (Number(existing.status) !== 0) throw new ChainError("Esta operación ya tiene fondos en el contrato.");

  const byShipment = Date.parse(`${addDays(op.po.latestShipmentDate, 30)}T23:59:59Z`);
  const deadline = Math.floor(Math.max(byShipment, Date.now() + 7 * 86_400_000) / 1000);

  // Las dos transacciones salen juntas, con nonces seguidos, para no esperar dos bloques.
  const nonce = await c.provider.getTransactionCount(c.buyer.address, "pending");
  const approveTx = await c.tokenAsBuyer.approve(c.escrowAddress, amount, { nonce });
  const fundTx = await c.escrowAsBuyer.fund(op.escrow.dealId, c.seller, c.tokenAddress, amount, deadline, {
    nonce: nonce + 1,
    gasLimit: 300_000,
  });
  await Promise.all([approveTx.wait(), fundTx.wait()]);

  return {
    network: s.network,
    amountUnits: amount.toString(),
    deadline,
    approveTx: approveTx.hash as string,
    fundTx: fundTx.hash as string,
  };
}

export async function releaseDeal(op: Operation, docsHash: string) {
  const s = await setup();
  const c = connect(s);
  const tx = await c.escrowAsArbiter.release(op.escrow.dealId, docsHash);
  await tx.wait();
  return { network: s.network, releaseTx: tx.hash as string };
}

export async function refundDeal(op: Operation) {
  const s = await setup();
  const c = connect(s);
  const tx = await c.escrowAsArbiter.refund(op.escrow.dealId);
  await tx.wait();
  return { network: s.network, refundTx: tx.hash as string };
}
