"use client";

import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";
import { PayBillConfirmCard } from "./pay-bill-confirm-card";
import { BuyAssetConfirmCard } from "./buy-asset-confirm-card";
import { useDemoState } from "@/contexts/demo-state-context";

interface ToolResultCardProps {
  toolName: string;
  result: unknown;
}

export function ToolResultCard({ toolName, result }: ToolResultCardProps) {
  let data: any;
  try {
    data = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    return null;
  }

  // ── Pending action cards ────────────────────────────────────────────────────

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

  // ── Data cards ──────────────────────────────────────────────────────────────

  if (toolName === "get_bills" && Array.isArray(data?.bills)) {
    return <BillsCard bills={data.bills} />;
  }

  if (
    (toolName === "get_investments" || toolName === "get_market_prices") &&
    Array.isArray(data?.assets)
  ) {
    return <AssetsCard assets={data.assets} />;
  }

  if (toolName === "get_payment_history" && Array.isArray(data?.payments)) {
    return <PaymentHistoryCard payments={data.payments} />;
  }

  // ── Legacy / other cards ────────────────────────────────────────────────────

  if (toolName === "get_vault_rates" && Array.isArray(data)) {
    return (
      <div className="my-2 space-y-1.5 rounded-xl border border-border/60 bg-cream-dark/30 px-4 py-3">
        <span className="label-mono text-[10px]">Current rates</span>
        {data.map((v: any) => (
          <div key={v.id} className="flex items-center justify-between">
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
          <div key={p.vaultId} className="flex items-center justify-between">
            <div>
              <span className="font-body text-xs text-ink">{p.vaultName}</span>
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
        <p className="font-mono text-[10px] text-ink-light">{goal.friendlyVault}</p>
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
          <div key={i} className="flex items-center justify-between">
            <span className="font-mono text-xs text-ink">{t.symbol}</span>
            <span className="font-mono text-xs text-ink-light">{t.balance}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  streaming: "Streaming",
  internet: "Internet",
  cable: "Cable",
  utility: "Utilities",
};

function BillsCard({ bills }: { bills: any[] }) {
  const { isBillPaid } = useDemoState();

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-cream-dark/30 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">
          Bills & Subscriptions
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {bills.map((bill: any) => {
          const active = isBillPaid(bill.id);
          return (
            <div key={bill.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs text-ink truncate">{bill.name}</span>
                  {active && (
                    <span className="shrink-0 rounded-full bg-sage/15 px-1.5 py-0.5 font-mono text-[9px] text-sage">
                      Active
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-ink-light">
                  {CATEGORY_LABEL[bill.category] ?? bill.category}
                  {bill.dueDay ? ` · due the ${bill.dueDay}${ordinal(bill.dueDay)}` : ""}
                </span>
              </div>
              <span className="ml-3 shrink-0 font-mono text-xs text-ink">
                ${Number(bill.amount).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetsCard({ assets }: { assets: any[] }) {
  return (
    <div className="my-2 rounded-xl border border-border/60 bg-cream-dark/30 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">
          Market Prices
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {assets.map((asset: any) => {
          const change = Number(asset.change24h ?? 0);
          const positive = change >= 0;
          return (
            <div key={asset.symbol} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink">{asset.symbol}</span>
                  <span className="rounded-full bg-border/60 px-1.5 py-0.5 font-mono text-[9px] text-ink-light capitalize">
                    {asset.type}
                  </span>
                </div>
                <span className="font-body text-[10px] text-ink-light truncate">{asset.name}</span>
              </div>
              <div className="ml-3 shrink-0 text-right">
                <p className="font-mono text-xs text-ink">${Number(asset.priceUsd).toFixed(2)}</p>
                {asset.change24h !== undefined && (
                  <p className={`font-mono text-[10px] ${positive ? "text-sage" : "text-fail"}`}>
                    {positive ? "+" : ""}{change.toFixed(2)}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaymentHistoryCard({ payments }: { payments: any[] }) {
  if (payments.length === 0) {
    return (
      <div className="my-2 rounded-xl border border-border/60 bg-cream-dark/30 px-4 py-3">
        <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">
          Payment History
        </span>
        <p className="mt-2 font-body text-xs text-ink-light">No payments yet.</p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-cream-dark/30 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">
          Payment History
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {payments.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="font-body text-xs text-ink truncate block">{p.description}</span>
              <span className="font-mono text-[10px] text-ink-light">
                {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                {p.type ? ` · ${p.type}` : ""}
              </span>
            </div>
            <div className="ml-3 shrink-0 text-right">
              <p className="font-mono text-xs text-ink">${Number(p.amountUsdc).toFixed(2)}</p>
              {p.status && (
                <p className={`font-mono text-[9px] ${p.status === "confirmed" ? "text-sage" : "text-ink-light"}`}>
                  {p.status}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
