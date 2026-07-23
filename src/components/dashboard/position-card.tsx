"use client";

import type { VaultStatsItem, UserVaultPosition } from "@yo-protocol/core";
import { formatUsd, formatApy, assetsToUsd, getPrice } from "@/lib/format";
import { VAULT_FRIENDLY_NAMES, VAULT_ACCENTS } from "@/lib/constants";

interface PositionCardProps {
  vault: VaultStatsItem;
  position: UserVaultPosition;
  prices: Record<string, number>;
  goal?: { name: string; targetUsd: number };
  onTap: (vault: VaultStatsItem) => void;
  onRemoveGoal?: () => void;
  onAddGoal?: () => void;
}

export function PositionCard({
  vault,
  position,
  prices,
  goal,
  onTap,
  onRemoveGoal,
  onAddGoal,
}: PositionCardProps) {
  const name = VAULT_FRIENDLY_NAMES[vault.id] || vault.name;
  const price = getPrice(prices, vault.asset.symbol);
  const usdValue = assetsToUsd(position.assets, vault.asset.decimals, price);
  const apy = formatApy(vault.yield?.["7d"]);
  const accent = VAULT_ACCENTS[vault.id];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap(vault)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onTap(vault); }}
      className="w-full cursor-pointer overflow-hidden rounded-xl border p-4 text-left transition-all duration-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      style={{
        borderColor: accent?.border || "var(--color-border)",
        background: accent
          ? `linear-gradient(to bottom, ${accent.bg}, rgba(255,254,242,0.4))`
          : "transparent",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-body text-[10px] tracking-[0.02em] text-ink-light">{name}</span>
          <p className="mt-1 font-display text-xl text-ink">
            {formatUsd(usdValue)}
          </p>
        </div>
        <span
          className="inline-block rounded-md px-2 py-0.5 font-body text-[10px]"
          style={{
            backgroundColor: accent?.bg || "rgba(143,174,130,0.1)",
            color: accent?.color || "var(--color-sage)",
          }}
        >
          {apy}
        </span>
      </div>

      {goal && (
        <>
          <div className="mt-3 h-1.5 rounded-full bg-border/50">
            <div
              className="h-full min-w-[3px] rounded-full transition-all duration-500"
              style={{
                width: `${goal.targetUsd > 0 ? Math.min(100, (usdValue / goal.targetUsd) * 100) : 0}%`,
                backgroundColor: accent?.color || "var(--color-sage)",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-display text-[11px] italic text-ink-light">
              {goal.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-body text-[10px] text-ink-light/60">
                {formatUsd(usdValue)} / {formatUsd(goal.targetUsd)}
              </span>
              {onRemoveGoal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveGoal(); }}
                  className="p-0.5 text-ink-light/25 transition-colors duration-150 hover:text-ink-light/50"
                  aria-label="Remove goal"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {!goal && onAddGoal && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddGoal(); }}
          className="mt-3 font-body text-[11px] text-ink-light/35 transition-colors duration-150 hover:text-ink-light/60"
        >
          + set a goal
        </button>
      )}
    </div>
  );
}
