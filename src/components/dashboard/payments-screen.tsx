"use client";

import { useDemoState } from "@/contexts/demo-state-context";

const TYPE_ICONS: Record<string, string> = {
  bill:       "🧾",
  investment: "📈",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day:   "numeric",
      hour:  "2-digit",
      minute:"2-digit",
    });
  } catch {
    return iso;
  }
}

export function PaymentsScreen() {
  const { payments } = useDemoState();

  const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="rounded-3xl bg-[#8FAE82] p-5">
        <p className="text-sm font-medium text-[#141513]/70">Total Spent</p>
        <p className="mt-1 text-3xl font-bold text-[#141513]">
          ${totalSpent.toFixed(2)}
        </p>
        <p className="mt-1 text-sm text-[#141513]/60">
          {payments.length} transaction{payments.length !== 1 ? "s" : ""}
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-4xl">💳</p>
          <p className="mt-2 font-semibold text-[#F2F0E8]">No transactions yet</p>
          <p className="mt-1 text-sm text-[#A7A79A]">
            Subscribe to a service or invest to see your history here
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center gap-3 rounded-2xl border border-[#2A2B27] bg-[#1B1C19] p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl">
                {TYPE_ICONS[payment.type] ?? "💳"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#F2F0E8]">
                  {payment.description}
                </p>
                <p className="text-xs text-[#A7A79A]">{formatDate(payment.paidAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-[#F2F0E8]">
                  ${payment.amount.toFixed(2)}
                </p>
                <p className="text-xs text-green-400">
                  {payment.usedNanopay ? "⚡ Nanopay" : "Paid"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
