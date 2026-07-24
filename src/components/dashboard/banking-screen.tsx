"use client";

import { useState, useCallback, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import type { ProviderMeta } from "@/lib/banking/registry";
import type { BankingTransaction, ProviderBalance, TransactionStatus } from "@/lib/banking/types";

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<TransactionStatus, string> = {
  completed:  "bg-sage/15 text-sage",
  processing: "bg-blue-500/15 text-blue-400",
  pending:    "bg-amber-500/15 text-amber-400",
  initiated:  "bg-border/60 text-ink-light",
  failed:     "bg-fail/15 text-fail",
  expired:    "bg-fail/10 text-fail/70",
};

function StatusPill({ status }: { status: TransactionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] capitalize ${STATUS_STYLE[status] ?? "bg-border/60 text-ink-light"}`}>
      {status}
    </span>
  );
}

// ── Shared field input ────────────────────────────────────────────────────────

function Field({ label, type = "text", placeholder, value, onChange, required, min }: {
  label: string; type?: string; placeholder?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; min?: number;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={onChange} required={required} min={min}
        className="mt-1.5 w-full rounded-xl border border-border bg-cream-dark/40 px-4 py-3 font-body text-sm text-ink placeholder:text-ink-light/40 outline-none focus:border-sage/50" />
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl border-t border-border bg-cream px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── Coming soon placeholder ───────────────────────────────────────────────────

function ComingSoon({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <span className="text-5xl">{icon}</span>
      <p className="mt-4 font-display text-lg text-ink">{title}</p>
      <p className="mt-2 max-w-xs font-body text-sm text-ink-light">{description}</p>
    </div>
  );
}

// ── Receive modal ─────────────────────────────────────────────────────────────

function ReceiveModal({
  provider, onClose, onSuccess,
}: {
  provider: ProviderMeta; onClose: () => void; onSuccess: (tx: BankingTransaction) => void;
}) {
  const [step, setStep] = useState<"form" | "qr">("form");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tx, setTx] = useState<BankingTransaction | null>(null);
  const [pollStatus, setPollStatus] = useState<TransactionStatus | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = Number(amount);
    if (!amtNum || amtNum < provider.minCollectionAmount) {
      setError(`Minimum amount is ${provider.currencySymbol}${provider.minCollectionAmount}`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/banking/${provider.id}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amtNum, description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create payment request");
      setTx(data as BankingTransaction);
      setStep("qr");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== "qr" || !tx) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/banking/${provider.id}/collections?id=${tx.id}`);
        if (!res.ok) return;
        const data: BankingTransaction = await res.json();
        if (!stopped) {
          setPollStatus(data.status);
          if (data.status === "completed" || data.status === "failed" || data.status === "expired") {
            onSuccess({ ...tx, ...data });
          }
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(poll, 5000);
    poll();
    return () => { stopped = true; clearInterval(interval); };
  }, [step, tx, provider.id, onSuccess]);

  const isTerminal = pollStatus === "completed" || pollStatus === "failed" || pollStatus === "expired";
  const qrValue = tx?.upiIntent ?? "";

  return (
    <ModalShell onClose={onClose}>
      {step === "form" && (
        <>
          <h2 className="font-display text-xl text-ink">Receive Money</h2>
          <p className="mt-1 font-body text-sm text-ink-light">UPI collection via {provider.name}</p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field
              label={`Amount (${provider.currencySymbol} ${provider.currency}) · min ${provider.currencySymbol}${provider.minCollectionAmount}`}
              type="number" min={provider.minCollectionAmount} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`e.g. ${provider.minCollectionAmount * 3}`} required
            />
            <Field label="Description (optional)" value={description}
              onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Invoice #123" />
            {error && <p className="font-body text-sm text-fail">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-sage py-3.5 font-mono text-sm font-semibold text-cream transition-opacity disabled:opacity-50">
              {loading ? "Creating…" : "Generate QR"}
            </button>
          </form>
        </>
      )}
      {step === "qr" && tx && (
        <div className="flex flex-col items-center gap-4">
          <h2 className="font-display text-xl text-ink">Scan to Pay</h2>
          <p className="font-body text-sm text-ink-light text-center">Scan in any UPI-compatible app. Polling for confirmation…</p>
          <div className="rounded-2xl border border-border bg-white p-4">
            {tx.qrCode ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tx.qrCode} alt="Payment QR" className="h-48 w-48" />
            ) : qrValue ? (
              <QRCodeSVG value={qrValue} size={192} bgColor="#ffffff" fgColor="#141513" />
            ) : tx.redirectUrl ? (
              <div className="flex h-48 w-48 items-center justify-center">
                <a href={tx.redirectUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-xl bg-sage px-4 py-2.5 font-mono text-sm font-semibold text-cream">
                  Open Payment Page ↗
                </a>
              </div>
            ) : (
              <div className="flex h-48 w-48 items-center justify-center">
                <p className="text-center font-body text-xs text-ink-light">QR unavailable</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl text-ink">{provider.currencySymbol}{tx.amount.toLocaleString()}</span>
            {pollStatus && <StatusPill status={pollStatus} />}
          </div>
          {qrValue && (
            <a href={qrValue} className="rounded-xl border border-sage/30 px-4 py-2 font-mono text-xs text-sage transition-colors hover:bg-sage/10">
              Open in Payment App
            </a>
          )}
          {isTerminal ? (
            <button onClick={onClose} className="w-full rounded-xl bg-sage py-3 font-mono text-sm font-semibold text-cream">
              {pollStatus === "completed" ? "Done ✓" : "Close"}
            </button>
          ) : (
            <p className="animate-pulse font-mono text-xs text-ink-light">Waiting for payment…</p>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ── Transfer modal (collection → payout wallet) ───────────────────────────────

function TransferModal({ provider, onClose, onSuccess }: {
  provider: ProviderMeta; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ afterCollectionBalance: number; afterPayoutBalance: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = Number(amount);
    if (!amtNum || amtNum <= 0) { setError("Enter a valid amount"); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/banking/${provider.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amtNum, currency: provider.currency }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Transfer failed");
      setResult(data);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      {result ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <span className="text-5xl">⇄</span>
          <h2 className="font-display text-xl text-ink">Transfer Complete</h2>
          <div className="w-full rounded-2xl border border-border/60 bg-cream-dark/30 p-4 space-y-2">
            <div className="flex justify-between font-mono text-sm">
              <span className="text-ink-light">Collection wallet</span>
              <span className="text-ink">{provider.currencySymbol}{result.afterCollectionBalance.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-ink-light">Payout wallet</span>
              <span className="text-ink">{provider.currencySymbol}{result.afterPayoutBalance.toLocaleString()}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-full rounded-xl bg-sage py-3 font-mono text-sm font-semibold text-cream">Done</button>
        </div>
      ) : (
        <>
          <h2 className="font-display text-xl text-ink">Transfer to Payout</h2>
          <p className="mt-1 font-body text-sm text-ink-light">Move funds from collection wallet to payout wallet</p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field label={`Amount (${provider.currencySymbol} ${provider.currency})`} type="number" min={1}
              placeholder="e.g. 1000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            {error && <p className="font-body text-sm text-fail">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-sage py-3.5 font-mono text-sm font-semibold text-cream transition-opacity disabled:opacity-50">
              {loading ? "Transferring…" : "Transfer Funds"}
            </button>
          </form>
        </>
      )}
    </ModalShell>
  );
}

// ── Ledger list (used inside Collection tab) ──────────────────────────────────

interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  created_at?: string;
  description?: string;
}

function LedgerList({ provider }: { provider: ProviderMeta }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 20;

  const fetchLedger = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/banking/${provider.id}/ledger?page=${p}&limit=${limit}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to load ledger");
      setEntries(data.data ?? []);
      setTotalCount(data.totalCount ?? 0);
    } catch (err: any) {
      setError(err?.message ?? "Could not load ledger");
    } finally {
      setLoading(false);
    }
  }, [provider.id]);

  useEffect(() => { fetchLedger(page); }, [fetchLedger, page]);

  if (loading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl border border-border/60 bg-cream-dark/30" />)}
    </div>
  );

  if (error) return (
    <div className="py-8 text-center">
      <p className="text-sm text-ink-light">{error}</p>
      <button onClick={() => fetchLedger(page)} className="mt-3 rounded-xl border border-border/60 px-4 py-2 font-mono text-xs text-ink-light hover:text-ink">Retry</button>
    </div>
  );

  if (entries.length === 0) return (
    <div className="py-8 text-center">
      <p className="text-3xl">📒</p>
      <p className="mt-2 text-sm text-ink-light">No ledger entries yet</p>
    </div>
  );

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-cream-dark/30 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-sm font-semibold text-ink capitalize">
                {entry.description ?? entry.type.replace(/_/g, " ")}
              </p>
              <p className="font-mono text-[10px] text-ink-light">
                {entry.created_at
                  ? new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : entry.id}
                {" · "}<span className="capitalize">{entry.status}</span>
              </p>
            </div>
            <p className={`shrink-0 font-mono text-sm font-semibold ${entry.type?.includes("credit") || entry.type?.includes("collection") ? "text-sage" : "text-ink"}`}>
              {provider.currencySymbol}{entry.amount.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="rounded-xl border border-border/60 px-3 py-1.5 font-mono text-xs text-ink-light hover:text-ink disabled:opacity-40">
            ← Prev
          </button>
          <span className="font-mono text-[10px] text-ink-light">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-border/60 px-3 py-1.5 font-mono text-xs text-ink-light hover:text-ink disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Collection tab ────────────────────────────────────────────────────────────

type CollectionSubTab = "payments" | "ledger";

function CollectionTab({ provider }: { provider: ProviderMeta }) {
  const [balance, setBalance] = useState<ProviderBalance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BankingTransaction[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [subTab, setSubTab] = useState<CollectionSubTab>("payments");
  const [showReceive, setShowReceive] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const res = await fetch(`/api/banking/${provider.id}/balance`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setBalance(data as ProviderBalance);
      setBalanceError(null);
    } catch (err: any) {
      setBalanceError(err?.message ?? "Could not load balance");
    } finally {
      setLoadingBalance(false);
    }
  }, [provider.id]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const res = await fetch(`/api/banking/${provider.id}/collections`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch { /* silently fail */ } finally {
      setLoadingTx(false);
    }
  }, [provider.id]);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  const handleCollectionSuccess = useCallback((tx: BankingTransaction) => {
    setTransactions((prev) => [tx, ...prev.filter((x) => x.id !== tx.id)]);
    fetchBalance();
    setShowReceive(false);
  }, [fetchBalance]);

  const collections = transactions.filter((t) => t.type === "collection");

  return (
    <div className="flex flex-col gap-4">
      {/* Balance card */}
      <div className="rounded-3xl bg-[#8FAE82] p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-[#141513]/70">Collection Balance</p>
            {loadingBalance ? (
              <div className="mt-1 h-9 w-32 animate-pulse rounded-lg bg-[#141513]/10" />
            ) : balanceError ? (
              <div>
                <p className="mt-1 font-display text-2xl text-[#141513]/60">—</p>
                <p className="mt-0.5 font-mono text-[10px] text-[#141513]/50">{balanceError}</p>
              </div>
            ) : (
              <p className="mt-1 font-display text-3xl font-bold text-[#141513]">
                {provider.currencySymbol}
                {(balance?.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            )}
            <p className="mt-0.5 font-mono text-[10px] text-[#141513]/60 uppercase tracking-wide">
              {provider.currency} · Collection Wallet
            </p>
          </div>
          <span className="text-2xl">{provider.flag}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => setShowReceive(true)}
            className="flex flex-col items-center gap-1 rounded-xl bg-[#141513] py-2.5 font-mono text-[10px] font-semibold text-[#F2F0E8]">
            <span className="text-base leading-none">↓</span>
            Receive
          </button>
          <button onClick={() => setShowTransfer(true)}
            className="flex flex-col items-center gap-1 rounded-xl bg-[#141513]/20 py-2.5 font-mono text-[10px] font-semibold text-[#141513]">
            <span className="text-base leading-none">⇄</span>
            Transfer
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl border border-border/60 bg-cream-dark/20 p-1">
        {(["payments", "ledger"] as CollectionSubTab[]).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`flex-1 rounded-lg py-2 font-mono text-xs font-semibold capitalize transition-colors ${
              subTab === t ? "bg-cream shadow-sm text-ink" : "text-ink-light hover:text-ink"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === "payments" && (
        loadingTx ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl border border-border/60 bg-cream-dark/30" />)}
          </div>
        ) : collections.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-3xl">📥</p>
            <p className="mt-2 font-semibold text-ink">No collections yet</p>
            <p className="mt-1 text-sm text-ink-light">Tap <strong>Receive</strong> to create a payment request</p>
          </div>
        ) : (
          <div className="space-y-2">
            {collections.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-cream-dark/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-lg">
                  {tx.status === "completed" ? "✅" : tx.status === "failed" || tx.status === "expired" ? "❌" : "⏳"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-semibold text-ink">
                    {tx.description ?? `Collection …${tx.id.slice(-6)}`}
                  </p>
                  <p className="font-mono text-[10px] text-ink-light">
                    {tx.createdAt
                      ? new Date(tx.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : tx.merchantReferenceId}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-semibold text-ink">
                    {provider.currencySymbol}{tx.amount.toLocaleString()}
                  </p>
                  <StatusPill status={tx.status} />
                </div>
              </div>
            ))}
          </div>
        )
      )}
      {subTab === "ledger" && <LedgerList provider={provider} />}

      {showReceive && (
        <ReceiveModal provider={provider} onClose={() => setShowReceive(false)} onSuccess={handleCollectionSuccess} />
      )}
      {showTransfer && (
        <TransferModal provider={provider} onClose={() => setShowTransfer(false)} onSuccess={fetchBalance} />
      )}
    </div>
  );
}

// ── Payout tab (placeholder — docs pending) ───────────────────────────────────

function PayoutTab({ provider: _provider }: { provider: ProviderMeta }) {
  return (
    <ComingSoon
      icon="💸"
      title="Payout"
      description="Send money to bank accounts and process disbursements. Implementation coming once Payout API docs are provided."
    />
  );
}

// ── Onramping tab (placeholder) ───────────────────────────────────────────────

function OnrampingTab({ provider: _provider }: { provider: ProviderMeta }) {
  return (
    <ComingSoon
      icon="🔄"
      title="Onramping"
      description="Convert INR to crypto seamlessly. Implementation coming once Onramping API docs are provided."
    />
  );
}

// ── Offramping tab (placeholder) ──────────────────────────────────────────────

function OfframpingTab({ provider: _provider }: { provider: ProviderMeta }) {
  return (
    <ComingSoon
      icon="💱"
      title="Offramping"
      description="Convert crypto back to INR. Implementation coming once Offramping API docs are provided."
    />
  );
}

// ── Provider panel ────────────────────────────────────────────────────────────

type FeatureTab = "collection" | "payout" | "onramping" | "offramping";

const FEATURE_TABS: { key: FeatureTab; label: string; icon: string }[] = [
  { key: "collection", label: "Collection", icon: "📥" },
  { key: "payout",     label: "Payout",     icon: "💸" },
  { key: "onramping",  label: "Onramp",     icon: "🔄" },
  { key: "offramping", label: "Offramp",    icon: "💱" },
];

function ProviderPanel({ provider }: { provider: ProviderMeta }) {
  const [activeTab, setActiveTab] = useState<FeatureTab>("collection");

  return (
    <div className="flex flex-col gap-4">
      {/* Feature tab bar */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-border/60 bg-cream-dark/20 p-1">
        {FEATURE_TABS.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center gap-0.5 rounded-lg py-2 transition-colors ${
              activeTab === t.key ? "bg-cream shadow-sm text-ink" : "text-ink-light hover:text-ink"
            }`}>
            <span className="text-sm leading-none">{t.icon}</span>
            <span className="font-mono text-[9px] font-semibold">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "collection"  && <CollectionTab  provider={provider} />}
      {activeTab === "payout"      && <PayoutTab      provider={provider} />}
      {activeTab === "onramping"   && <OnrampingTab   provider={provider} />}
      {activeTab === "offramping"  && <OfframpingTab  provider={provider} />}
    </div>
  );
}

// ── Provider selector (multi-provider) ───────────────────────────────────────

function ProviderSelector({ providers, selected, onSelect }: {
  providers: ProviderMeta[]; selected: ProviderMeta; onSelect: (p: ProviderMeta) => void;
}) {
  if (providers.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {providers.map((p) => (
        <button key={p.id} onClick={() => onSelect(p)}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-xs transition-colors ${
            selected.id === p.id
              ? "border-sage/40 bg-sage/10 text-sage"
              : "border-border/60 bg-cream-dark/30 text-ink-light hover:border-sage/20 hover:text-ink"
          }`}>
          <span>{p.flag}</span>
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main banking screen ───────────────────────────────────────────────────────

export function BankingScreen() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/banking/providers")
      .then((r) => r.json())
      .then((data: ProviderMeta[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setProviders(data);
          setSelectedProvider(data[0]);
        } else {
          setError("No banking providers configured.");
        }
      })
      .catch(() => setError("Failed to load banking providers."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-xl bg-cream-dark/60" />
        <div className="h-44 animate-pulse rounded-3xl bg-cream-dark/60" />
        <div className="h-16 animate-pulse rounded-2xl border border-border/60 bg-cream-dark/30" />
      </div>
    );
  }

  if (error || !selectedProvider) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl">🏦</p>
        <p className="mt-3 font-semibold text-ink">Banking unavailable</p>
        <p className="mt-1 text-sm text-ink-light">{error ?? "No providers configured."}</p>
        <p className="mt-3 font-mono text-xs text-ink-light/60">
          Add CREDIBLE_FINANCE_API_KEY + CREDIBLE_FINANCE_API_SECRET to .env
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ProviderSelector providers={providers} selected={selectedProvider} onSelect={setSelectedProvider} />
      <ProviderPanel key={selectedProvider.id} provider={selectedProvider} />
    </div>
  );
}
