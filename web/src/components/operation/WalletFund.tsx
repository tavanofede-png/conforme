"use client";

import { CircleNotchIcon } from "@phosphor-icons/react";
import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import { useState } from "react";

const TOKEN_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];
const ESCROW_ABI = ["function fund(bytes32 dealId, address seller, address token, uint256 amount, uint64 deadline)"];

interface FundParams {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  gasSymbol: string;
  escrow: string;
  token: string;
  seller: string;
  dealId: string;
  amount: string;
  deadline: number;
  error?: string;
}

export function WalletFund({
  operationId,
  disabled,
  onConfirmed,
}: {
  operationId: string;
  disabled: boolean;
  onConfirmed: (approveTx: string, fundTx: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      if (!eth) throw new Error("No encontramos una billetera en el navegador.");
      const res = await fetch(`/api/operations/${operationId}/escrow`);
      const params = (await res.json()) as FundParams;
      if (!res.ok) throw new Error(params.error ?? "No se pudo preparar el depósito.");

      const chainHex = `0x${params.chainId.toString(16)}`;
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      } catch (err) {
        if ((err as { code?: number }).code !== 4902) throw err;
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainHex,
              chainName: params.chainName,
              rpcUrls: [params.rpcUrl],
              nativeCurrency: {
                name: params.gasSymbol,
                symbol: params.gasSymbol === "ETH" ? "ETH" : "tRBTC",
                decimals: 18,
              },
            },
          ],
        });
      }

      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const token = new Contract(params.token, TOKEN_ABI, signer);
      const escrow = new Contract(params.escrow, ESCROW_ABI, signer);
      const approveTx = await token.approve(params.escrow, params.amount);
      const fundTx = await escrow.fund(params.dealId, params.seller, params.token, params.amount, params.deadline);
      await Promise.all([approveTx.wait(), fundTx.wait()]);
      onConfirmed(String(approveTx.hash), String(fundTx.hash));
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      setError(e.shortMessage ?? e.message ?? "La billetera rechazó el depósito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex max-w-xs flex-col items-start gap-1">
      <button type="button" className="btn btn-secondary btn-lg" onClick={sign} disabled={disabled || busy}>
        {busy && <CircleNotchIcon size={16} className="animate-spin" />}
        {busy ? "Firmando…" : "Firmar con mi billetera"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}
