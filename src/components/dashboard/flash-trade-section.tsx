"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { Transaction } from "@solana/web3.js";
import type { FlashMarket } from "@/lib/flash";

// ── Types ─────────────────────────────────────────────────────────────────────

type Side = "long" | "short";
type OrderTab = "market" | "limit" | "trigger";
type ManageTab = "collateral" | "increase" | "tp-sl";

interface OpenQuote {
  entryPrice: number | null;
  fee: number | null;
  collateral: number;
  leverage: number;
  collateralSymbol: string;
}

interface CloseQuote {
  exitPrice: number | null;
  fee: number | null;
  pnl: number | null;
  receiveAmount: number | null;
  collateralSymbol: string;
}

interface PositionStats {
  pnl: number | null;
  liqPrice: number | null;
}

interface CollateralQuote {
  newLeverage: number | null;
  newLiqPrice: number | null;
  receiveAmount?: number | null;
  fee: number | null;
  collateralSymbol: string;
}

interface FlashPosition {
  marketId?: number;
  sizeAmount?: { toString: () => string };
  collateralAmount?: { toString: () => string };
  [key: string]: unknown;
}

interface FlashOrder {
  orderId?: { toNumber?: () => number };
  marketId?: number;
  limitPrice?: { toNumber?: () => number };
  triggerPrice?: { toNumber?: () => number };
  sizeAmount?: { toString: () => string };
  isStopLoss?: boolean;
  orderType?: string;
  [key: string]: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ER_RPC = "https://flash.magicblock.xyz";
const MARKET_SYMBOLS = ["SOL", "BTC", "ETH"] as const;
const MARKET_ICONS: Record<string, string> = { SOL: "◎", BTC: "₿", ETH: "Ξ" };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signAndSendTx(
  base64Tx: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction: (input: any) => Promise<any>,
): Promise<string> {
  const tx = Transaction.from(Buffer.from(base64Tx, "base64"));
  const result = await signTransaction({ transaction: tx });
  const signed: Transaction = result?.signedTransaction ?? result;
  const raw = Buffer.from(signed.serialize()).toString("base64");
  const res = await fetch(ER_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [raw, { encoding: "base64", skipPreflight: true }] }),
  });
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result ?? "";
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

// ── Sheet wrapper ─────────────────────────────────────────────────────────────

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl bg-[#1B1C19] border-t border-[#2A2B27] max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#2A2B27] flex-none">
          <h3 className="text-base font-semibold text-[#F2F0E8]">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#A7A79A] hover:bg-white/[0.06]">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 pb-10">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function TxResult({ hash, error }: { hash?: string; error?: string }) {
  if (hash) return (
    <div className="mt-3 rounded-xl bg-green-900/20 px-3 py-2 text-xs text-green-400">
      ✓ Submitted — <a href={`https://solscan.io/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">view on Solscan</a>
    </div>
  );
  if (error) return <p className="mt-3 rounded-xl bg-red-900/20 px-3 py-2 text-xs text-red-400">{error}</p>;
  return null;
}

// ── Trade Sheet (market + limit orders) ───────────────────────────────────────

function TradeSheet({
  market, side, solanaAddress, getToken, onClose,
}: {
  market: FlashMarket; side: Side; solanaAddress: string;
  getToken: () => Promise<string | null>; onClose: () => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [orderTab, setOrderTab]   = useState<OrderTab>("market");
  const [collateral, setCollateral] = useState("10");
  const [leverage, setLeverage]   = useState(2);
  const [limitPrice, setLimitPrice] = useState("");
  const [tpPrice, setTpPrice]     = useState("");
  const [slPrice, setSlPrice]     = useState("");
  const [quote, setQuote]         = useState<OpenQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash]       = useState<string>();
  const [error, setError]         = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuote = useCallback(async () => {
    const col = Number(collateral);
    if (!col || col <= 0) return;
    setQuoteLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/flash/quote?marketId=${market.marketId}&collateral=${col}&leverage=${leverage}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.ok) setQuote(await res.json());
    } finally { setQuoteLoading(false); }
  }, [collateral, leverage, market.marketId, getToken]);

  useEffect(() => {
    if (orderTab !== "market") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchQuote, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchQuote, orderTab]);

  const handleMarketTrade = async () => {
    setExecuting(true); setError(undefined); setTxHash(undefined);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/flash/build-open", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ownerAddress: solanaAddress, marketId: market.marketId, collateralUsd: Number(collateral), leverage, slippageBps: 100 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { transaction } = await res.json() as { transaction: string };
      setTxHash(await signAndSendTx(transaction, signTransaction));
    } catch (e) { setError((e as Error)?.message ?? "Failed"); }
    finally { setExecuting(false); }
  };

  const handleLimitOrder = async () => {
    setExecuting(true); setError(undefined); setTxHash(undefined);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/flash/build-limit-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ownerAddress: solanaAddress,
          marketId: market.marketId,
          limitPrice: Number(limitPrice),
          collateralUsd: Number(collateral),
          leverage,
          takeProfitPrice: tpPrice ? Number(tpPrice) : undefined,
          stopLossPrice: slPrice ? Number(slPrice) : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { transaction } = await res.json() as { transaction: string };
      setTxHash(await signAndSendTx(transaction, signTransaction));
    } catch (e) { setError((e as Error)?.message ?? "Failed"); }
    finally { setExecuting(false); }
  };

  const positionSize = quote?.entryPrice && quote.collateral && quote.leverage
    ? (quote.collateral * quote.leverage) / quote.entryPrice : null;
  const liqPrice = quote?.entryPrice
    ? side === "long"
      ? quote.entryPrice * (1 - 0.9 / quote.leverage)
      : quote.entryPrice * (1 + 0.9 / quote.leverage)
    : null;

  return (
    <Sheet title={`${side === "long" ? "🟢 Long" : "🔴 Short"} ${market.symbol}`} onClose={onClose}>
      {/* Order type tabs */}
      <div className="mb-5 flex rounded-xl bg-white/[0.04] p-1 gap-1">
        {(["market", "limit"] as const).map((t) => (
          <button key={t} onClick={() => setOrderTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${orderTab === t ? "bg-[#F2F0E8] text-[#141513]" : "text-[#A7A79A]"}`}>
            {t === "market" ? "Market" : "Limit"}
          </button>
        ))}
      </div>

      {/* Collateral */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Collateral ({market.collateralSymbol})</label>
        <input type="number" value={collateral} onChange={(e) => setCollateral(e.target.value)} min="1"
          className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
      </div>

      {/* Leverage */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-[#A7A79A]">Leverage</label>
          <span className="rounded-lg bg-[#8FAE82]/15 px-2 py-0.5 text-xs font-bold text-[#8FAE82]">{leverage}×</span>
        </div>
        <input type="range" min={1} max={Math.min(market.maxLev, 100)} step={1} value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))} className="w-full accent-[#8FAE82]" />
        <div className="mt-1 flex justify-between text-[10px] text-[#A7A79A]"><span>1×</span><span>{Math.min(market.maxLev, 100)}×</span></div>
      </div>

      {/* Limit price (limit orders only) */}
      {orderTab === "limit" && (
        <>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Limit Price (USD)</label>
            <input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder="e.g. 150.00"
              className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-green-400">Take Profit (optional)</label>
              <input type="number" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} placeholder="—"
                className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-3 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-red-400">Stop Loss (optional)</label>
              <input type="number" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder="—"
                className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-3 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-red-500" />
            </div>
          </div>
        </>
      )}

      {/* Quote (market orders only) */}
      {orderTab === "market" && (
        <div className="mb-5 rounded-2xl border border-[#2A2B27] bg-[#141513] px-4 py-3.5 text-xs">
          {quoteLoading ? (
            <div className="flex items-center gap-2 text-[#A7A79A]">
              <div className="h-3 w-3 animate-spin rounded-full border border-[#A7A79A] border-t-transparent" />
              <span>Fetching quote…</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              <div><p className="text-[#A7A79A]">Entry price</p><p className="font-semibold text-[#F2F0E8]">${fmt(quote?.entryPrice)}</p></div>
              <div><p className="text-[#A7A79A]">Position size</p><p className="font-semibold text-[#F2F0E8]">{positionSize ? `${positionSize.toFixed(4)} ${market.symbol}` : "—"}</p></div>
              <div><p className="text-[#A7A79A]">Liq. price</p><p className="font-semibold text-red-400">${fmt(liqPrice)}</p></div>
              <div><p className="text-[#A7A79A]">Fee</p><p className="font-semibold text-[#F2F0E8]">{quote?.fee ? `${fmt(quote.fee, 4)} ${quote.collateralSymbol}` : "—"}</p></div>
            </div>
          )}
        </div>
      )}

      <p className="mb-4 text-[10px] text-[#A7A79A]">◎ Trades execute on Solana mainnet via your embedded wallet.</p>

      <button
        onClick={orderTab === "market" ? handleMarketTrade : handleLimitOrder}
        disabled={executing || Number(collateral) <= 0 || (orderTab === "limit" && !limitPrice)}
        className={`w-full rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-50 ${side === "long" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
      >
        {executing ? "Signing & submitting…"
          : orderTab === "market"
            ? `Open ${leverage}× ${side === "long" ? "Long" : "Short"} — $${(Number(collateral) * leverage).toFixed(0)}`
            : `Place Limit Order — $${(Number(collateral) * leverage).toFixed(0)}`}
      </button>
      <TxResult hash={txHash} error={error} />
    </Sheet>
  );
}

// ── Close Sheet ───────────────────────────────────────────────────────────────

function CloseSheet({
  position, market, solanaAddress, getToken, onClose,
}: {
  position: FlashPosition; market: FlashMarket; solanaAddress: string;
  getToken: () => Promise<string | null>; onClose: () => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [closeMode, setCloseMode] = useState<"full" | "partial">("full");
  const [partialUsd, setPartialUsd] = useState("");
  const [quote, setQuote]           = useState<CloseQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting]   = useState(false);
  const [txHash, setTxHash]         = useState<string>();
  const [error, setError]           = useState<string>();

  const fetchCloseQuote = useCallback(async () => {
    setQuoteLoading(true);
    try {
      const token = await getToken();
      const sizeDeltaParam = closeMode === "partial" && partialUsd ? `&sizeDeltaUsd=${partialUsd}` : "";
      const res = await fetch(
        `/api/flash/close-quote?wallet=${encodeURIComponent(solanaAddress)}&marketId=${market.marketId}${sizeDeltaParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.ok) setQuote(await res.json());
    } finally { setQuoteLoading(false); }
  }, [solanaAddress, market.marketId, closeMode, partialUsd, getToken]);

  useEffect(() => { fetchCloseQuote(); }, [fetchCloseQuote]);

  const handleClose = async () => {
    setExecuting(true); setError(undefined); setTxHash(undefined);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const endpoint = closeMode === "full" ? "/api/flash/build-close" : "/api/flash/build-partial-close";
      const body = closeMode === "full"
        ? { ownerAddress: solanaAddress, marketId: market.marketId }
        : { ownerAddress: solanaAddress, marketId: market.marketId, sizeDeltaUsd: Number(partialUsd) };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { transaction } = await res.json() as { transaction: string };
      setTxHash(await signAndSendTx(transaction, signTransaction));
    } catch (e) { setError((e as Error)?.message ?? "Failed"); }
    finally { setExecuting(false); }
  };

  const pnlColor = quote?.pnl != null ? (quote.pnl >= 0 ? "text-green-400" : "text-red-400") : "text-[#F2F0E8]";

  return (
    <Sheet title={`Close ${market.symbol} ${market.side === "long" ? "Long" : "Short"}`} onClose={onClose}>
      {/* Close mode tabs */}
      <div className="mb-5 flex rounded-xl bg-white/[0.04] p-1 gap-1">
        {(["full", "partial"] as const).map((m) => (
          <button key={m} onClick={() => setCloseMode(m)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${closeMode === m ? "bg-[#F2F0E8] text-[#141513]" : "text-[#A7A79A]"}`}>
            {m === "full" ? "Full Close" : "Partial Close"}
          </button>
        ))}
      </div>

      {closeMode === "partial" && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Amount to close (USD)</label>
          <input type="number" value={partialUsd} onChange={(e) => setPartialUsd(e.target.value)} placeholder="e.g. 50"
            className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
        </div>
      )}

      {/* Quote */}
      <div className="mb-5 rounded-2xl border border-[#2A2B27] bg-[#141513] px-4 py-3.5 text-xs">
        {quoteLoading ? (
          <div className="flex items-center gap-2 text-[#A7A79A]">
            <div className="h-3 w-3 animate-spin rounded-full border border-[#A7A79A] border-t-transparent" />
            <span>Loading quote…</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <div><p className="text-[#A7A79A]">Exit price</p><p className="font-semibold text-[#F2F0E8]">${fmt(quote?.exitPrice)}</p></div>
            <div><p className="text-[#A7A79A]">Receive</p><p className="font-semibold text-[#F2F0E8]">{quote?.receiveAmount != null ? `${fmt(quote.receiveAmount, 4)} ${quote.collateralSymbol}` : "—"}</p></div>
            <div><p className="text-[#A7A79A]">PnL</p><p className={`font-semibold ${pnlColor}`}>{quote?.pnl != null ? `${quote.pnl >= 0 ? "+" : ""}${fmt(quote.pnl, 4)} ${quote.collateralSymbol}` : "—"}</p></div>
            <div><p className="text-[#A7A79A]">Fee</p><p className="font-semibold text-[#F2F0E8]">{quote?.fee != null ? `${fmt(quote.fee, 4)} ${quote?.collateralSymbol}` : "—"}</p></div>
          </div>
        )}
      </div>

      <button onClick={handleClose} disabled={executing || (closeMode === "partial" && !partialUsd)}
        className="w-full rounded-2xl bg-red-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50">
        {executing ? "Closing…" : closeMode === "full" ? "Close Full Position" : `Close $${partialUsd || "?"} of Position`}
      </button>
      <TxResult hash={txHash} error={error} />
    </Sheet>
  );
}

// ── Manage Position Sheet (collateral + increase + TP/SL) ─────────────────────

function ManageSheet({
  position, market, solanaAddress, getToken, onClose,
}: {
  position: FlashPosition; market: FlashMarket; solanaAddress: string;
  getToken: () => Promise<string | null>; onClose: () => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [tab, setTab]             = useState<ManageTab>("collateral");
  const [colDirection, setColDir] = useState<"add" | "remove">("add");
  const [colAmount, setColAmount] = useState("");
  const [colQuote, setColQuote]   = useState<CollateralQuote | null>(null);
  const [colQuoteLoading, setColQuoteLoading] = useState(false);
  // increase position
  const [addCol, setAddCol]       = useState("");
  const [sizeIncrease, setSizeIncrease] = useState("");
  // tp/sl
  const [tpPrice, setTpPrice]     = useState("");
  const [slPrice, setSlPrice]     = useState("");
  const [tpSize, setTpSize]       = useState("");
  const [slSize, setSlSize]       = useState("");
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash]       = useState<string>();
  const [error, setError]         = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch collateral quote on amount change
  useEffect(() => {
    if (!colAmount || Number(colAmount) <= 0) { setColQuote(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setColQuoteLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/flash/collateral-quote?wallet=${encodeURIComponent(solanaAddress)}&marketId=${market.marketId}&collateralUsd=${colAmount}&direction=${colDirection}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (res.ok) setColQuote(await res.json());
      } finally { setColQuoteLoading(false); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [colAmount, colDirection, solanaAddress, market.marketId, getToken]);

  const execTx = async (endpoint: string, body: Record<string, unknown>) => {
    setExecuting(true); setError(undefined); setTxHash(undefined);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { transaction } = await res.json() as { transaction: string };
      setTxHash(await signAndSendTx(transaction, signTransaction));
    } catch (e) { setError((e as Error)?.message ?? "Failed"); }
    finally { setExecuting(false); }
  };

  const handleCollateral = () => {
    const endpoint = colDirection === "add" ? "/api/flash/build-add-collateral" : "/api/flash/build-remove-collateral";
    execTx(endpoint, { ownerAddress: solanaAddress, marketId: market.marketId, collateralUsd: Number(colAmount) });
  };

  const handleIncrease = () => execTx("/api/flash/build-increase-position", {
    ownerAddress: solanaAddress, marketId: market.marketId,
    addCollateralUsd: Number(addCol), sizeDeltaUsd: Number(sizeIncrease), slippageBps: 100,
  });

  const handlePlaceTp = () => execTx("/api/flash/build-trigger-order", {
    ownerAddress: solanaAddress, marketId: market.marketId,
    triggerPrice: Number(tpPrice), deltaSizeUsd: Number(tpSize), isStopLoss: false,
  });

  const handlePlaceSl = () => execTx("/api/flash/build-trigger-order", {
    ownerAddress: solanaAddress, marketId: market.marketId,
    triggerPrice: Number(slPrice), deltaSizeUsd: Number(slSize), isStopLoss: true,
  });

  return (
    <Sheet title={`Manage ${market.symbol} ${market.side === "long" ? "Long" : "Short"}`} onClose={onClose}>
      {/* Sub-tabs */}
      <div className="mb-5 flex rounded-xl bg-white/[0.04] p-1 gap-1">
        {([["collateral", "Collateral"], ["increase", "Increase"], ["tp-sl", "TP / SL"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${tab === key ? "bg-[#F2F0E8] text-[#141513]" : "text-[#A7A79A]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Collateral tab ── */}
      {tab === "collateral" && (
        <>
          <div className="mb-4 flex rounded-xl bg-white/[0.04] p-1 gap-1">
            {(["add", "remove"] as const).map((d) => (
              <button key={d} onClick={() => { setColDir(d); setColQuote(null); setColAmount(""); }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${colDirection === d ? "bg-[#F2F0E8] text-[#141513]" : "text-[#A7A79A]"}`}>
                {d === "add" ? "➕ Add" : "➖ Remove"}
              </button>
            ))}
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Amount ({market.collateralSymbol})</label>
            <input type="number" value={colAmount} onChange={(e) => setColAmount(e.target.value)} placeholder="e.g. 20"
              className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
          </div>

          {/* Quote preview */}
          <div className="mb-4 rounded-2xl border border-[#2A2B27] bg-[#141513] px-4 py-3 text-xs">
            {colQuoteLoading ? (
              <div className="flex items-center gap-2 text-[#A7A79A]">
                <div className="h-3 w-3 animate-spin rounded-full border border-[#A7A79A] border-t-transparent" />
                <span>Calculating…</span>
              </div>
            ) : colQuote ? (
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <div><p className="text-[#A7A79A]">New leverage</p><p className="font-semibold text-[#F2F0E8]">{colQuote.newLeverage != null ? `${colQuote.newLeverage.toFixed(2)}×` : "—"}</p></div>
                <div><p className="text-[#A7A79A]">New liq. price</p><p className="font-semibold text-red-400">${fmt(colQuote.newLiqPrice)}</p></div>
                {colQuote.receiveAmount != null && (
                  <div><p className="text-[#A7A79A]">You receive</p><p className="font-semibold text-[#F2F0E8]">{fmt(colQuote.receiveAmount, 4)} {colQuote.collateralSymbol}</p></div>
                )}
                <div><p className="text-[#A7A79A]">Fee</p><p className="font-semibold text-[#F2F0E8]">{colQuote.fee != null ? `${fmt(colQuote.fee, 4)} ${colQuote.collateralSymbol}` : "—"}</p></div>
              </div>
            ) : (
              <p className="text-[#A7A79A]">Enter an amount to see impact on leverage & liquidation price</p>
            )}
          </div>

          <p className="mb-4 text-[10px] text-[#A7A79A]">
            {colDirection === "add" ? "Adding collateral reduces leverage and liquidation risk." : "Removing collateral increases leverage and liquidation risk."}
          </p>
          <button onClick={handleCollateral} disabled={executing || !colAmount}
            className="w-full rounded-2xl bg-[#8FAE82] py-3.5 text-sm font-semibold text-[#141513] disabled:opacity-50">
            {executing ? "Submitting…" : `${colDirection === "add" ? "Add" : "Remove"} $${colAmount || "?"} Collateral`}
          </button>
        </>
      )}

      {/* ── Increase size tab ── */}
      {tab === "increase" && (
        <>
          <p className="mb-4 text-xs text-[#A7A79A]">Add more size to your existing position. You can optionally add extra collateral to keep leverage stable.</p>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Additional collateral ({market.collateralSymbol})</label>
            <input type="number" value={addCol} onChange={(e) => setAddCol(e.target.value)} placeholder="e.g. 10"
              className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
          </div>
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Size increase (USD notional)</label>
            <input type="number" value={sizeIncrease} onChange={(e) => setSizeIncrease(e.target.value)} placeholder="e.g. 100"
              className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
          </div>
          <button onClick={handleIncrease} disabled={executing || !addCol || !sizeIncrease}
            className="w-full rounded-2xl bg-[#8FAE82] py-3.5 text-sm font-semibold text-[#141513] disabled:opacity-50">
            {executing ? "Submitting…" : `Increase Position by $${sizeIncrease || "?"}`}
          </button>
        </>
      )}

      {/* ── TP/SL tab ── */}
      {tab === "tp-sl" && (
        <>
          <p className="mb-4 text-xs text-[#A7A79A]">Trigger orders auto-close part or all of your position at a target price.</p>
          <div className="mb-5 rounded-2xl border border-[#2A2B27] bg-[#141513] p-4">
            <p className="mb-3 text-xs font-semibold text-green-400">Take Profit</p>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-[#A7A79A]">Trigger Price (USD)</label>
                <input type="number" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} placeholder="—"
                  className="w-full rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-3 py-2 text-sm text-[#F2F0E8] outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[#A7A79A]">Close Size (USD)</label>
                <input type="number" value={tpSize} onChange={(e) => setTpSize(e.target.value)} placeholder="—"
                  className="w-full rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-3 py-2 text-sm text-[#F2F0E8] outline-none focus:border-green-500" />
              </div>
            </div>
            <button onClick={handlePlaceTp} disabled={executing || !tpPrice || !tpSize}
              className="w-full rounded-xl bg-green-500/20 py-2 text-xs font-semibold text-green-400 disabled:opacity-50">
              {executing ? "Submitting…" : "Place Take Profit"}
            </button>
          </div>
          <div className="mb-4 rounded-2xl border border-[#2A2B27] bg-[#141513] p-4">
            <p className="mb-3 text-xs font-semibold text-red-400">Stop Loss</p>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-[#A7A79A]">Trigger Price (USD)</label>
                <input type="number" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder="—"
                  className="w-full rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-3 py-2 text-sm text-[#F2F0E8] outline-none focus:border-red-500" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[#A7A79A]">Close Size (USD)</label>
                <input type="number" value={slSize} onChange={(e) => setSlSize(e.target.value)} placeholder="—"
                  className="w-full rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-3 py-2 text-sm text-[#F2F0E8] outline-none focus:border-red-500" />
              </div>
            </div>
            <button onClick={handlePlaceSl} disabled={executing || !slPrice || !slSize}
              className="w-full rounded-xl bg-red-500/20 py-2 text-xs font-semibold text-red-400 disabled:opacity-50">
              {executing ? "Submitting…" : "Place Stop Loss"}
            </button>
          </div>
        </>
      )}

      <TxResult hash={txHash} error={error} />
    </Sheet>
  );
}

// ── Open Position Card ────────────────────────────────────────────────────────

function PositionCard({
  position, markets, solanaAddress, getToken,
}: {
  position: FlashPosition; markets: FlashMarket[];
  solanaAddress: string; getToken: () => Promise<string | null>;
}) {
  const market = markets[position.marketId ?? -1];
  const [stats, setStats]         = useState<PositionStats | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [showManage, setShowManage] = useState(false);

  useEffect(() => {
    if (!market || !solanaAddress) return;
    (async () => {
      try {
        const res = await fetch(`/api/flash/position-stats?wallet=${encodeURIComponent(solanaAddress)}&marketId=${market.marketId}`);
        if (res.ok) setStats(await res.json());
      } catch { /* silent */ }
    })();
  }, [market, solanaAddress]);

  if (!market) return null;
  const pnlColor = stats?.pnl != null ? (stats.pnl >= 0 ? "text-green-400" : "text-red-400") : "text-[#A7A79A]";
  const size = position.sizeAmount ? Number(position.sizeAmount.toString()) / 1e9 : 0;

  return (
    <>
      <div className="rounded-2xl border border-[#2A2B27] bg-[#1B1C19] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{MARKET_ICONS[market.symbol] ?? "?"}</span>
            <div>
              <p className="text-sm font-semibold text-[#F2F0E8]">{market.symbol} {market.side === "long" ? "Long" : "Short"}</p>
              <p className="text-[10px] text-[#A7A79A]">{market.collateralSymbol} collateral</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-sm font-bold ${pnlColor}`}>
              {stats?.pnl != null ? `${stats.pnl >= 0 ? "+" : ""}$${fmt(stats.pnl)}` : "—"}
            </p>
            <p className="text-[10px] text-[#A7A79A]">Unrealised PnL</p>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/[0.04] px-3 py-2">
            <p className="text-[#A7A79A]">Size</p>
            <p className="font-semibold text-[#F2F0E8]">{size.toFixed(4)} {market.symbol}</p>
          </div>
          <div className="rounded-xl bg-white/[0.04] px-3 py-2">
            <p className="text-[#A7A79A]">Liq. price</p>
            <p className="font-semibold text-red-400">${fmt(stats?.liqPrice)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShowManage(true)}
            className="flex-1 rounded-xl bg-white/[0.06] py-2 text-xs font-semibold text-[#F2F0E8] hover:bg-white/[0.1]">
            Manage
          </button>
          <button onClick={() => setShowClose(true)}
            className="flex-1 rounded-xl bg-red-500/20 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/30">
            Close
          </button>
        </div>
      </div>

      {showClose && (
        <CloseSheet position={position} market={market} solanaAddress={solanaAddress} getToken={getToken} onClose={() => setShowClose(false)} />
      )}
      {showManage && (
        <ManageSheet position={position} market={market} solanaAddress={solanaAddress} getToken={getToken} onClose={() => setShowManage(false)} />
      )}
    </>
  );
}

// ── Edit Order Sheet ──────────────────────────────────────────────────────────

function EditOrderSheet({
  order, market, solanaAddress, getToken, onClose, onDone,
}: {
  order: FlashOrder; market: FlashMarket; solanaAddress: string;
  getToken: () => Promise<string | null>; onClose: () => void; onDone: () => void;
}) {
  const { signTransaction } = useSignTransaction();
  const isLimit = !order.triggerPrice && !("isStopLoss" in order && order.isStopLoss != null);
  const isTrigger = !isLimit;
  const currentPrice = (order.limitPrice?.toNumber?.() ?? order.triggerPrice?.toNumber?.() ?? 0) / 1e6;
  const orderId = order.orderId?.toNumber?.() ?? 0;

  const [newPrice, setNewPrice]   = useState(currentPrice > 0 ? String(currentPrice) : "");
  const [newSize, setNewSize]     = useState("");
  const [newTp, setNewTp]         = useState("");
  const [newSl, setNewSl]         = useState("");
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash]       = useState<string>();
  const [error, setError]         = useState<string>();

  const handleEdit = async () => {
    setExecuting(true); setError(undefined); setTxHash(undefined);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const body = isLimit
        ? { ownerAddress: solanaAddress, marketId: market.marketId, orderId, orderType: "limit",
            newLimitPrice: Number(newPrice), newSizeUsd: Number(newSize),
            newTakeProfitPrice: newTp ? Number(newTp) : undefined,
            newStopLossPrice: newSl ? Number(newSl) : undefined }
        : { ownerAddress: solanaAddress, marketId: market.marketId, orderId, orderType: "trigger",
            isStopLoss: order.isStopLoss ?? false,
            newTriggerPrice: Number(newPrice), newDeltaSizeUsd: Number(newSize) };
      const res = await fetch("/api/flash/edit-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { transaction } = await res.json() as { transaction: string };
      setTxHash(await signAndSendTx(transaction, signTransaction));
      onDone();
    } catch (e) { setError((e as Error)?.message ?? "Failed"); }
    finally { setExecuting(false); }
  };

  const label = order.isStopLoss === false ? "Take Profit" : order.isStopLoss === true ? "Stop Loss" : "Limit";

  return (
    <Sheet title={`Edit ${label} — ${market.symbol}`} onClose={onClose}>
      <p className="mb-4 text-xs text-[#A7A79A]">Update the price and/or size of this pending order.</p>
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">{isTrigger ? "Trigger" : "Limit"} Price (USD)</label>
        <input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
          className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-[#A7A79A]">Size (USD)</label>
        <input type="number" value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Leave blank to keep current"
          className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-4 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-[#8FAE82]" />
      </div>
      {isLimit && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] text-green-400">Take Profit (optional)</label>
            <input type="number" value={newTp} onChange={(e) => setNewTp(e.target.value)} placeholder="—"
              className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-3 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-green-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-red-400">Stop Loss (optional)</label>
            <input type="number" value={newSl} onChange={(e) => setNewSl(e.target.value)} placeholder="—"
              className="w-full rounded-xl border border-[#2A2B27] bg-[#141513] px-3 py-2.5 text-sm text-[#F2F0E8] outline-none focus:border-red-500" />
          </div>
        </div>
      )}
      <button onClick={handleEdit} disabled={executing || !newPrice || !newSize}
        className="w-full rounded-2xl bg-[#8FAE82] py-3.5 text-sm font-semibold text-[#141513] disabled:opacity-50">
        {executing ? "Submitting…" : "Update Order"}
      </button>
      <TxResult hash={txHash} error={error} />
    </Sheet>
  );
}

// ── Orders list ───────────────────────────────────────────────────────────────

function OrdersList({
  orders, markets, solanaAddress, getToken, onRefresh,
}: {
  orders: FlashOrder[]; markets: FlashMarket[];
  solanaAddress: string; getToken: () => Promise<string | null>;
  onRefresh: () => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [editingOrder, setEditingOrder] = useState<FlashOrder | null>(null);

  const cancelOrder = async (order: FlashOrder) => {
    const id = order.orderId?.toNumber?.() ?? 0;
    setCancelling(id);
    try {
      const token = await getToken();
      const market = markets[order.marketId ?? -1];
      if (!market || !token) return;
      const isLimit = !("isStopLoss" in order && order.isStopLoss !== undefined && order.triggerPrice);
      const res = await fetch("/api/flash/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ownerAddress: solanaAddress, marketId: market.marketId,
          orderId: id, orderType: isLimit ? "limit" : "trigger",
          isStopLoss: order.isStopLoss ?? false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { transaction } = await res.json() as { transaction: string };
      await signAndSendTx(transaction, signTransaction);
      onRefresh();
    } catch (e) { console.error("Cancel order failed:", e); }
    finally { setCancelling(null); }
  };

  if (!orders.length) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[#A7A79A] uppercase tracking-wider">Open Orders</p>
        {orders.map((order, i) => {
          const market = markets[order.marketId ?? -1];
          if (!market) return null;
          const id = order.orderId?.toNumber?.() ?? i;
          const price = order.limitPrice?.toNumber?.() ?? order.triggerPrice?.toNumber?.() ?? 0;
          const label = order.isStopLoss === false ? "TP" : order.isStopLoss === true ? "SL" : "Limit";
          return (
            <div key={id} className="rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-[#F2F0E8]">{label} {market.symbol} {market.side === "long" ? "Long" : "Short"}</p>
                  <p className="text-[10px] text-[#A7A79A]">@ ${(price / 1e6).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingOrder(order)}
                  className="flex-1 rounded-lg bg-white/[0.06] py-1.5 text-xs font-medium text-[#F2F0E8] hover:bg-white/[0.1]">
                  Edit
                </button>
                <button onClick={() => cancelOrder(order)} disabled={cancelling === id}
                  className="flex-1 rounded-lg bg-red-500/15 py-1.5 text-xs font-medium text-red-400 disabled:opacity-50">
                  {cancelling === id ? "…" : "Cancel"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editingOrder && (() => {
        const market = markets[editingOrder.marketId ?? -1];
        return market ? (
          <EditOrderSheet
            order={editingOrder} market={market}
            solanaAddress={solanaAddress} getToken={getToken}
            onClose={() => setEditingOrder(null)}
            onDone={() => { setEditingOrder(null); onRefresh(); }}
          />
        ) : null;
      })()}
    </>
  );
}

// ── Main Flash Trade Section ──────────────────────────────────────────────────

export function FlashTradeSection() {
  const { user, getAccessToken } = usePrivy();
  const [markets, setMarkets]     = useState<FlashMarket[]>([]);
  const [positions, setPositions] = useState<FlashPosition[]>([]);
  const [orders, setOrders]       = useState<FlashOrder[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("SOL");
  const [selectedSide, setSelectedSide]     = useState<Side>("long");
  const [showTrade, setShowTrade]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [posLoading, setPosLoading] = useState(false);

  const solanaAddress: string =
    (user?.linkedAccounts?.find((a) =>
      (a as { chainType?: string }).chainType === "solana" &&
      (a as { walletClientType?: string }).walletClientType === "privy"
    ) as { address?: string } | undefined)?.address ?? "";

  const getToken = useCallback(() => getAccessToken(), [getAccessToken]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/flash/markets", { headers: await authHeaders() });
        if (res.ok) {
          const data = await res.json() as { markets: FlashMarket[] };
          setMarkets(data.markets.filter((m) => MARKET_SYMBOLS.includes(m.symbol as (typeof MARKET_SYMBOLS)[number])));
        }
      } finally { setLoading(false); }
    })();
  }, [authHeaders]);

  const loadPositions = useCallback(async () => {
    if (!solanaAddress) return;
    setPosLoading(true);
    try {
      const res = await fetch(`/api/flash/positions?wallet=${encodeURIComponent(solanaAddress)}`, { headers: await authHeaders() });
      if (res.ok) {
        const data = await res.json() as { positions: FlashPosition[]; orders: FlashOrder[] };
        setPositions(data.positions);
        setOrders(data.orders);
      }
    } finally { setPosLoading(false); }
  }, [solanaAddress, authHeaders]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  const activeMarket = markets.find((m) => m.symbol === selectedSymbol && m.side === selectedSide);
  const availableSides: Side[] = [
    ...(markets.some((m) => m.symbol === selectedSymbol && m.side === "long") ? ["long" as const] : []),
    ...(markets.some((m) => m.symbol === selectedSymbol && m.side === "short") ? ["short" as const] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#F2F0E8]">Flash Trade</p>
          <p className="text-xs text-[#A7A79A]">Perpetuals · Solana mainnet · Up to 100×</p>
        </div>
        <a
          href="https://flash.trade"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-[#2A2B27] bg-[#1B1C19] px-3 py-1.5 text-xs font-medium text-[#A7A79A] hover:border-[#3A3B37] hover:text-[#F2F0E8] transition-colors"
        >
          Open flash.trade
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 8.5L8.5 1.5M8.5 1.5H3.5M8.5 1.5V6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      {loading ? (
        <div className="h-40 rounded-2xl border border-[#2A2B27] bg-[#1B1C19] animate-pulse" />
      ) : (
        <div className="rounded-2xl border border-[#2A2B27] bg-[#1B1C19] p-4">
          {/* Market selector */}
          <div className="mb-4 flex gap-2">
            {MARKET_SYMBOLS.map((sym) => (
              <button key={sym} onClick={() => setSelectedSymbol(sym)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  selectedSymbol === sym ? "bg-[#F2F0E8] text-[#141513]" : "bg-white/[0.04] text-[#A7A79A] hover:bg-white/[0.08]"
                }`}>
                <span>{MARKET_ICONS[sym]}</span>
                <span>{sym}</span>
              </button>
            ))}
          </div>

          {/* Side selector */}
          <div className="mb-4 flex gap-2">
            {availableSides.map((s) => (
              <button key={s} onClick={() => setSelectedSide(s)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                  selectedSide === s
                    ? s === "long" ? "bg-green-500 text-white" : "bg-red-500 text-white"
                    : "bg-white/[0.04] text-[#A7A79A]"
                }`}>
                {s === "long" ? "🟢 Long" : "🔴 Short"}
              </button>
            ))}
          </div>

          {/* Trade button */}
          <button
            onClick={() => setShowTrade(true)}
            disabled={!activeMarket || !solanaAddress}
            className={`w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-40 ${
              selectedSide === "long" ? "bg-green-500 text-white" : "bg-red-500 text-white"
            }`}>
            {!solanaAddress ? "Connect Solana wallet first"
              : `Open ${selectedSide === "long" ? "Long" : "Short"} ${selectedSymbol}`}
          </button>
        </div>
      )}

      {/* Open Positions */}
      {posLoading ? (
        <div className="h-20 rounded-2xl border border-[#2A2B27] animate-pulse" />
      ) : positions.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-[#A7A79A] uppercase tracking-wider">Open Positions</p>
          {positions.map((pos, i) => (
            <PositionCard key={i} position={pos} markets={markets} solanaAddress={solanaAddress} getToken={getToken} />
          ))}
        </div>
      ) : null}

      {/* Open Orders */}
      {orders.length > 0 && (
        <OrdersList orders={orders} markets={markets} solanaAddress={solanaAddress} getToken={getToken} onRefresh={loadPositions} />
      )}

      {showTrade && activeMarket && (
        <TradeSheet market={activeMarket} side={selectedSide} solanaAddress={solanaAddress} getToken={getToken} onClose={() => setShowTrade(false)} />
      )}
    </div>
  );
}
