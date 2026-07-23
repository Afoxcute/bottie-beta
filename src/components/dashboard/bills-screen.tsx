"use client";

import { useState } from "react";
import { DEMO_BILLS, type DemoBill } from "@/lib/demo-data";
import { useDemoState } from "@/contexts/demo-state-context";
import { PaymentModal } from "./payment-modal";
import { useChatSheet } from "@/contexts/chat-context";

const CATEGORY_TABS = [
  { key: "all",       label: "All"        },
  { key: "streaming", label: "Streaming"  },
  { key: "internet",  label: "Internet"   },
  { key: "cable",     label: "Cable"      },
  { key: "utility",   label: "Utilities"  },
] as const;

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface BillCardProps {
  bill: DemoBill;
  paid: boolean;
  onSubscribe: () => void;
}

function BillCard({ bill, paid, onSubscribe }: BillCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#2A2B27] bg-[#1B1C19] p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-2xl">
        {bill.icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-[#F2F0E8]">{bill.name}</p>
        <p className="text-xs text-[#A7A79A]">
          {bill.description}
          {paid ? ` · renews on the ${ordinal(bill.dueDay)}` : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-[#F2F0E8]">
          ${bill.amount.toFixed(2)}
          <span className="text-xs font-normal text-[#A7A79A]">/mo</span>
        </p>
        {paid ? (
          <span className="mt-1 inline-block rounded-full bg-green-900/40 px-2.5 py-0.5 text-xs font-medium text-green-400">
            Active ✓
          </span>
        ) : (
          <button
            onClick={onSubscribe}
            className="mt-1 rounded-xl bg-[#8FAE82] px-3 py-1 text-xs font-semibold text-[#141513]"
          >
            Subscribe
          </button>
        )}
      </div>
    </div>
  );
}

export function BillsScreen() {
  const { isBillPaid, markBillPaid, paidBillIds } = useDemoState();
  const { open: openChat, sendMessage } = useChatSheet();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [payingBill, setPayingBill] = useState<DemoBill | null>(null);

  const filtered =
    activeTab === "all"
      ? DEMO_BILLS
      : DEMO_BILLS.filter((b) => b.category === activeTab);

  const activeCost = DEMO_BILLS.filter((b) => paidBillIds.includes(b.id)).reduce(
    (sum, b) => sum + b.amount,
    0
  );

  const handleSuccess = async (txHash: string) => {
    if (!payingBill) return;
    const bill = payingBill;
    setPayingBill(null);

    let nanopay: { usedNanopay?: boolean; txHash?: string | null } = {};
    try {
      const res = await fetch("/api/nanopay/checkout", { method: "POST" });
      if (res.ok) nanopay = await res.json();
    } catch {
      // nanopay settlement is best-effort; the on-chain transfer already succeeded
    }

    markBillPaid(bill.id, bill.amount, bill.name, nanopay);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary card */}
      <div className="rounded-3xl bg-[#8FAE82] p-5">
        <p className="text-sm font-medium text-[#141513]/70">Active Subscriptions</p>
        <p className="mt-1 text-3xl font-bold text-[#141513]">
          ${activeCost.toFixed(2)}
          <span className="text-base font-medium">/mo</span>
        </p>
        <p className="mt-0.5 text-xs text-[#141513]/50">
          {paidBillIds.length} of {DEMO_BILLS.length} services active
        </p>
        <button
          onClick={() => {
            sendMessage("Show me my active subscriptions and bills");
            openChat();
          }}
          className="mt-4 rounded-xl bg-[#141513]/20 px-4 py-2 text-sm font-semibold text-[#141513]"
        >
          Ask AI about my bills
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[#F2F0E8] text-[#141513]"
                : "bg-white/[0.06] text-[#A7A79A]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Services list */}
      <div className="flex flex-col gap-3">
        {filtered.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            paid={isBillPaid(bill.id)}
            onSubscribe={() => setPayingBill(bill)}
          />
        ))}
      </div>

      {/* Payment modal */}
      {payingBill && (
        <PaymentModal
          title={payingBill.name}
          subtitle={payingBill.description}
          icon={payingBill.icon}
          amount={payingBill.amount}
          ctaLabel={`Subscribe · $${payingBill.amount.toFixed(2)}/mo`}
          onSuccess={handleSuccess}
          onClose={() => setPayingBill(null)}
        />
      )}
    </div>
  );
}
