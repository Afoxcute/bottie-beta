"use client";

import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/format";

export interface ActivityItem {
  type: "deposit" | "withdraw" | "swap";
  amount: string;
  tokenSymbol: string;
  vaultId?: string;
  txHash?: string;
  createdAt: string;
}

function activityDescription(item: ActivityItem): string {
  const vaultName = item.vaultId
    ? VAULT_FRIENDLY_NAMES[item.vaultId] || item.vaultId
    : item.tokenSymbol;
  switch (item.type) {
    case "deposit":
      return `Saved to ${vaultName}`;
    case "withdraw":
      return `Withdrew from ${vaultName}`;
    case "swap":
      return `Swapped to ${item.tokenSymbol}`;
  }
}

// Smart amount formatting — no 20-decimal soup
function fmtAmt(raw: string): string {
  const n = parseFloat(raw);
  if (!n || isNaN(n)) return "0";
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return parseFloat(n.toPrecision(5)).toString();
  if (n >= 0.001) return parseFloat(n.toPrecision(4)).toString();
  return parseFloat(n.toPrecision(3)).toString();
}

const ICON_PATHS: Record<ActivityItem["type"], string> = {
  deposit: "M12 5v14M5 12l7 7 7-7",
  withdraw: "M12 19V5M19 12l-7-7-7 7",
  swap: "M7 10l-3 3 3 3M17 14l3-3-3-3M6 13h12",
};

interface ActivityListProps {
  activities: ActivityItem[];
}

export function ActivityList({ activities }: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className="py-5 text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="mx-auto mb-2 text-ink-light/30"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="font-body text-sm text-ink-light">Nothing here yet</p>
        <p className="mt-0.5 font-body text-[11px] text-ink-light/50">
          Your deposits and withdrawals will appear here
        </p>
      </div>
    );
  }

  return (
    <div>
      {activities.map((item, i) => {
        const iconPath = ICON_PATHS[item.type];
        const isDeposit = item.type === "deposit";
        const iconBg = isDeposit ? "bg-sage/10" : "bg-ink/[0.04]";
        const iconColor = isDeposit ? "text-sage" : "text-ink-light/50";
        const amountColor = isDeposit ? "text-sage" : "text-ink-light";

        const inner = (
          <>
            {/* Icon */}
            <div className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${iconBg}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={iconColor}>
                <path d={iconPath} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Description + time */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-[14px] leading-snug text-ink">
                {activityDescription(item)}
              </p>
              <p className="mt-0.5 font-body text-[11px] text-ink-light/40">
                {formatRelativeTime(item.createdAt)}
              </p>
            </div>

            {/* Amount */}
            <div className="flex-none text-right">
              <span className={`font-mono text-[12px] tabular-nums ${amountColor}`}>
                {isDeposit ? "+" : "−"}{fmtAmt(item.amount)}
              </span>
              <p className="font-body text-[10px] text-ink-light/40">{item.tokenSymbol}</p>
            </div>
          </>
        );

        const rowClass = `flex items-center gap-3 py-3${
          i < activities.length - 1 ? " border-b border-border/30" : ""
        }${item.txHash ? " -mx-1 cursor-pointer rounded-xl px-1 transition-colors duration-150 hover:bg-ink/[0.02] active:bg-ink/[0.04]" : ""}`;

        return item.txHash ? (
          <a
            key={item.txHash}
            href={`https://basescan.org/tx/${item.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={rowClass}
          >
            {inner}
          </a>
        ) : (
          <div key={i} className={rowClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
