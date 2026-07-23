"use client";

import { useState, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { arcKit, AGENT_CHAIN } from "@/lib/arc-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { useDemoState } from "@/contexts/demo-state-context";

const RECEIVER = "0x9404966338eB27aF420a952574d777598Bbb58c4" as const;

type Status = "idle" | "pending" | "success" | "error";

interface Props {
  symbol: string;
  assetName: string;
  shares: number;
  priceUsd: number;
  totalUsdc: number;
  icon: string;
  type: string;
}

export function BuyAssetConfirmCard({
  symbol,
  assetName,
  shares,
  priceUsd,
  totalUsdc,
  icon,
  type,
}: Props) {
  const { wallets } = useWallets();
  const { buyAsset } = useDemoState();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (status === "pending" || status === "success") return;
    setStatus("pending");
    setErrorMsg(null);

    try {
      const privyWallet = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
      if (!privyWallet) throw new Error("No wallet connected");

      const provider = await privyWallet.getEthereumProvider();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = await createViemAdapterFromProvider({ provider: provider as any });
      const result = await arcKit.send({
        from: { adapter, chain: AGENT_CHAIN },
        to: RECEIVER,
        amount: totalUsdc.toFixed(6),
        token: "USDC",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((result as any)?.state && (result as any).state !== "success") {
        throw new Error("Transfer did not complete");
      }

      // Best-effort x402 nanopay settlement
      let nanopay: { usedNanopay?: boolean; txHash?: string | null } = {};
      try {
        const res = await fetch("/api/nanopay/checkout", { method: "POST" });
        if (res.ok) nanopay = await res.json();
      } catch { /* non-critical */ }

      buyAsset(symbol, assetName, type, icon, shares, priceUsd, nanopay);

      // Record in DB so get_payment_history tool reflects the purchase
      try {
        await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "investment",
            referenceId: symbol,
            description: `Bought ${shares} share${shares !== 1 ? "s" : ""} of ${assetName} (${symbol})`,
            amountUsdc: totalUsdc.toFixed(6),
            status: "completed",
            txHash: nanopay.txHash ?? null,
          }),
        });
      } catch { /* non-critical */ }

      setStatus("success");
    } catch (err: unknown) {
      const msg = ((err as Error)?.message ?? "").toLowerCase();
      setErrorMsg(
        msg.includes("reject") || msg.includes("cancel") || msg.includes("denied")
          ? "Purchase cancelled."
          : "Purchase could not be processed. Please try again.",
      );
      setStatus("error");
    }
  }, [status, wallets, totalUsdc, symbol, assetName, type, icon, shares, priceUsd, buyAsset]);

  if (status === "success") {
    return (
      <div className="my-2 flex items-center gap-3 rounded-xl border border-green-700/30 bg-green-900/10 px-4 py-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-400">
            {shares} share{shares !== 1 ? "s" : ""} of {symbol} — Purchased ✓
          </p>
          <p className="text-xs text-[#A7A79A]">${totalUsdc.toFixed(2)} USDC · settled via Circle</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-4 py-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#F2F0E8]">
            {assetName}
            <span className="ml-1.5 text-xs font-normal text-[#A7A79A]">{symbol}</span>
          </p>
          <p className="text-xs text-[#A7A79A]">
            {shares} share{shares !== 1 ? "s" : ""} @ ${priceUsd.toFixed(2)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold text-[#F2F0E8]">
          ${totalUsdc.toFixed(2)}
          <span className="block text-right text-[10px] font-normal text-[#A7A79A]">USDC</span>
        </p>
      </div>
      {errorMsg && (
        <p className="mb-3 rounded-lg bg-red-900/20 px-3 py-1.5 text-xs text-red-400">
          {errorMsg}
        </p>
      )}
      <button
        onClick={handleConfirm}
        disabled={status === "pending"}
        className="w-full rounded-xl bg-[#8FAE82] py-2.5 text-sm font-semibold text-[#141513] disabled:opacity-60"
      >
        {status === "pending" ? "Confirming in wallet…" : `Confirm · $${totalUsdc.toFixed(2)} USDC`}
      </button>
    </div>
  );
}
