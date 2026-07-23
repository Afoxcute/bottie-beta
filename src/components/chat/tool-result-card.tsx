"use client";

import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";
import { PayBillConfirmCard } from "./pay-bill-confirm-card";
import { BuyAssetConfirmCard } from "./buy-asset-confirm-card";

interface ToolResultCardProps {
  toolName: string;
  result: unknown;
}

export function ToolResultCard({
  toolName,
  result,
}: ToolResultCardProps) {

  let data: any;
  try {
    data = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    return null;
  }

  if (toolName === "pay_bill" && data?.pendingPayment) {
    return (
      <PayBillConfirmCard
        billId={data.billId}
        billName={data.billName}
        amount={data.amount}
        icon={data.icon}
        description={data.description}
      />
    );
  }

  if (toolName === "buy_investment" && data?.pendingPurchase) {
    return (
      <BuyAssetConfirmCard
        symbol={data.symbol}
        assetName={data.assetName}
        shares={data.shares}
        priceUsd={data.priceUsd}
        totalUsdc={data.totalUsdc}
        icon={data.icon}
        type={data.type}
      />
    );
  }

  if (toolName === "get_vault_rates" && Array.isArray(data)) {
    return (
      <div className="my-2 space-y-1.5 rounded-xl border border-border/60 bg-cream-dark/30 px-4 py-3">
        <span className="label-mono text-[10px]">Current rates</span>
        {data.map((v: any) => (
          <div
            key={v.id}
            className="flex items-center justify-between"
          >
            <span className="font-body text-xs text-ink">
              {VAULT_FRIENDLY_NAMES[v.id] || v.name}
            </span>
            <span className="rounded-md bg-sage/10 px-1.5 py-0.5 font-mono text-[10px] text-sage">
              {v.apy}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "get_user_positions" && Array.isArray(data)) {
    return (
      <div className="my-2 space-y-1.5 rounded-xl border border-border/60 bg-cream-dark/30 px-4 py-3">
        <span className="label-mono text-[10px]">Your savings</span>
        {data.map((p: any) => (
          <div
            key={p.vaultId}
            className="flex items-center justify-between"
          >
            <div>
              <span className="font-body text-xs text-ink">
                {p.vaultName}
              </span>
              {p.apy && p.apy !== "N/A" && (
                <span className="ml-1.5 rounded-md bg-sage/10 px-1.5 py-0.5 font-mono text-[10px] text-sage">
                  {p.apy}
                </span>
              )}
            </div>
            <span className="font-mono text-xs text-ink">
              {p.deposited} {p.tokenSymbol}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "create_goal" && data?.success) {
    const goal = data.goal;
    return (
      <div className="my-2 space-y-1.5 rounded-xl border border-sage/20 bg-sage/5 px-4 py-3">
        <span className="label-mono text-[10px]">Goal set</span>
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-ink">{goal.name}</span>
          <span className="font-mono text-xs text-ink">
            {Number(goal.targetAmount).toLocaleString("en-US")} {goal.currency}
          </span>
        </div>
        <p className="font-mono text-[10px] text-ink-light">
          {goal.friendlyVault}
        </p>
      </div>
    );
  }

  if (toolName === "get_goals" && Array.isArray(data)) {
    return (
      <div className="my-2 space-y-1.5 rounded-xl border border-border/60 bg-cream-dark/30 px-4 py-3">
        <span className="label-mono text-[10px]">Your goals</span>
        {data.map((g: any) => (
          <div key={g.vaultId} className="flex items-center justify-between">
            <span className="font-body text-xs text-ink">{g.name}</span>
            <span className="font-mono text-xs text-ink">
              {Number(g.targetAmount).toLocaleString("en-US")} {g.currency}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "get_wallet_balance" && data && !data.error) {
    return (
      <div className="my-2 space-y-1.5 rounded-xl border border-border/60 bg-cream-dark/30 px-4 py-3">
        <span className="label-mono text-[10px]">Wallet balance</span>
        {data.tokens?.map((t: any, i: number) => (
          <div
            key={i}
            className="flex items-center justify-between"
          >
            <span className="font-mono text-xs text-ink">{t.symbol}</span>
            <span className="font-mono text-xs text-ink-light">
              {t.balance}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
