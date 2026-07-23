"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DEMO_ASSETS, ASSET_PRICES, type DemoAsset } from "@/lib/demo-data";
import { useDemoState, type PortfolioPosition } from "@/contexts/demo-state-context";
import { PaymentModal } from "./payment-modal";
import { useChatSheet } from "@/contexts/chat-context";

const TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  ipo:   "Pre-IPO",
  etf:   "ETF",
};

const MARKET_TABS = [
  { key: "all",   label: "All"      },
  { key: "stock", label: "Stocks"   },
  { key: "ipo",   label: "Pre-IPO"  },
  { key: "etf",   label: "ETFs"     },
] as const;

function PortfolioCard({ pos }: { pos: PortfolioPosition }) {
  const currentPrice = ASSET_PRICES[pos.symbol] ?? pos.avgPriceUsd;
  const currentValue = pos.shares * currentPrice;
  const gainLoss = currentValue - pos.shares * pos.avgPriceUsd;
  const isPos = gainLoss >= 0;

  return (
    <div className="rounded-2xl border border-[#2A2B27] bg-[#1B1C19] p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-xl">
            {pos.icon}
          </div>
          <div>
            <p className="font-semibold text-[#F2F0E8]">{pos.symbol}</p>
            <p className="text-xs text-[#A7A79A]">{pos.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold text-[#F2F0E8]">${currentValue.toFixed(2)}</p>
          <p className={`text-xs font-medium ${isPos ? "text-green-400" : "text-red-400"}`}>
            {isPos ? "+" : ""}${gainLoss.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-[#A7A79A]">
        <span>{pos.shares.toFixed(4)} shares</span>
        <span>avg ${pos.avgPriceUsd.toFixed(2)}</span>
        <span>now ${currentPrice.toFixed(2)}</span>
      </div>
    </div>
  );
}

interface BuySheetProps {
  asset: DemoAsset;
  onClose: () => void;
  onConfirm: (shares: number, total: number) => void;
}

function BuySheet({ asset, onClose, onConfirm }: BuySheetProps) {
  const [sharesInput, setSharesInput] = useState("1");
  const [confirming, setConfirming] = useState(false);

  const shares = Math.max(0, Number(sharesInput) || 0);
  const total = shares * asset.priceUsd;

  if (confirming) {
    return (
      <PaymentModal
        title={`Buy ${asset.symbol}`}
        subtitle={`${shares} share${shares !== 1 ? "s" : ""} · ${asset.name}`}
        icon={asset.icon}
        amount={total}
        ctaLabel={`Invest $${total.toFixed(2)}`}
        onSuccess={() => onConfirm(shares, total)}
        onClose={() => setConfirming(false)}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl bg-[#1B1C19] p-6 pb-10 border-t border-[#2A2B27]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{asset.icon}</span>
            <div>
              <h3 className="text-lg font-semibold text-[#F2F0E8]">Buy {asset.symbol}</h3>
              <p className="text-xs text-[#A7A79A]">{asset.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#A7A79A] hover:bg-white/[0.06]"
          >
            ✕
          </button>
        </div>

        {/* Price info */}
        <div className="mb-4 rounded-2xl border border-[#2A2B27] bg-[#141513] p-4">
          <div className="flex justify-between text-sm">
            <span className="text-[#A7A79A]">Price per share</span>
            <span className="font-semibold text-[#F2F0E8]">${asset.priceUsd.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-[#A7A79A]">Type</span>
            <span className="font-medium text-[#F2F0E8]">{TYPE_LABELS[asset.type] ?? asset.type}</span>
          </div>
        </div>

        {/* Shares input */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[#A7A79A]">
            Number of shares
          </label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={sharesInput}
            onChange={(e) => setSharesInput(e.target.value)}
            className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]"
          />
        </div>

        {/* Total */}
        <div className="mb-5 flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
          <span className="text-sm text-[#A7A79A]">Total investment</span>
          <span className="text-xl font-bold text-[#F2F0E8]">${total.toFixed(2)}</span>
        </div>

        <button
          onClick={() => setConfirming(true)}
          disabled={shares <= 0}
          className="w-full rounded-2xl bg-[#8FAE82] py-3.5 text-sm font-semibold text-[#141513] disabled:opacity-50"
        >
          Review & Invest
        </button>
      </div>
    </div>,
    document.body
  );
}

export function InvestmentsScreen() {
  const { portfolio, buyAsset } = useDemoState();
  const { open: openChat, sendMessage } = useChatSheet();
  const [viewTab, setViewTab] = useState<"portfolio" | "market">("portfolio");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [buyingAsset, setBuyingAsset] = useState<DemoAsset | null>(null);

  const portfolioValue = portfolio.reduce(
    (sum, p) => sum + p.shares * (ASSET_PRICES[p.symbol] ?? p.avgPriceUsd),
    0
  );

  const marketEntries = DEMO_ASSETS.filter(
    (a) => marketFilter === "all" || a.type === marketFilter
  );

  const handleConfirm = async (shares: number) => {
    if (!buyingAsset) return;
    const asset = buyingAsset;
    setBuyingAsset(null);

    let nanopay: { usedNanopay?: boolean; txHash?: string | null } = {};
    try {
      const res = await fetch("/api/nanopay/checkout", { method: "POST" });
      if (res.ok) nanopay = await res.json();
    } catch {
      // nanopay settlement is best-effort; the on-chain transfer already succeeded
    }

    buyAsset(
      asset.symbol,
      asset.name,
      asset.type,
      asset.icon,
      shares,
      asset.priceUsd,
      nanopay
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary card */}
      <div className="rounded-3xl bg-[#8FAE82] p-5">
        <p className="text-sm font-medium text-[#141513]/70">Portfolio Value</p>
        <p className="mt-1 text-3xl font-bold text-[#141513]">
          ${portfolioValue.toFixed(2)}
        </p>
        <p className="mt-0.5 text-xs text-[#141513]/50">
          {portfolio.length} position{portfolio.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => {
            sendMessage("What should I invest in? Show me my portfolio.");
            openChat();
          }}
          className="mt-4 rounded-xl bg-[#141513]/20 px-4 py-2 text-sm font-semibold text-[#141513]"
        >
          Ask AI for advice
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(["portfolio", "market"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setViewTab(tab)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
              viewTab === tab
                ? "bg-[#F2F0E8] text-[#141513]"
                : "bg-white/[0.06] text-[#A7A79A]"
            }`}
          >
            {tab === "portfolio" ? "My Portfolio" : "Market"}
          </button>
        ))}
      </div>

      {/* Portfolio view */}
      {viewTab === "portfolio" && (
        <>
          {portfolio.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-4xl">📊</p>
              <p className="mt-2 font-semibold text-[#F2F0E8]">No positions yet</p>
              <p className="mt-1 text-sm text-[#A7A79A]">
                Browse the market to start investing
              </p>
              <button
                onClick={() => setViewTab("market")}
                className="mt-4 rounded-2xl bg-[#8FAE82] px-6 py-2.5 text-sm font-semibold text-[#141513]"
              >
                Browse Market
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {portfolio.map((pos) => (
                <PortfolioCard key={pos.symbol} pos={pos} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Market view */}
      {viewTab === "market" && (
        <>
          {/* Type filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MARKET_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMarketFilter(tab.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  marketFilter === tab.key
                    ? "bg-[#F2F0E8] text-[#141513]"
                    : "bg-white/[0.06] text-[#A7A79A]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {marketEntries.map((asset) => {
              const ownedPos = portfolio.find((p) => p.symbol === asset.symbol);
              const isPos = asset.change24h >= 0;
              return (
                <div
                  key={asset.symbol}
                  className="flex items-center gap-4 rounded-2xl border border-[#2A2B27] bg-[#1B1C19] p-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-2xl">
                    {asset.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#F2F0E8]">{asset.symbol}</p>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-[#A7A79A]">
                        {TYPE_LABELS[asset.type] ?? asset.type}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[#A7A79A]">{asset.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-[#F2F0E8]">${asset.priceUsd.toFixed(2)}</p>
                    {asset.change24h !== 0 && (
                      <p className={`text-xs ${isPos ? "text-green-400" : "text-red-400"}`}>
                        {isPos ? "+" : ""}{asset.change24h.toFixed(2)}%
                      </p>
                    )}
                    <button
                      onClick={() => setBuyingAsset(asset)}
                      className="mt-1 rounded-xl bg-[#8FAE82] px-3 py-1 text-xs font-semibold text-[#141513]"
                    >
                      {ownedPos ? "Buy more" : "Buy"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {buyingAsset && (
        <BuySheet
          asset={buyingAsset}
          onClose={() => setBuyingAsset(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
