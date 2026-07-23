"use client";

import type { VaultStatsItem } from "@yo-protocol/core";
import { formatUsd, formatApy } from "@/lib/format";
import { VAULT_FRIENDLY_NAMES, VAULT_ACCENTS } from "@/lib/constants";

interface GoalCardProps {
  goal: { name: string; targetUsd: number };
  vault: VaultStatsItem;
  onTap: (vault: VaultStatsItem) => void;
  onRemoveGoal?: () => void;
}

export function GoalCard({ goal, vault, onTap, onRemoveGoal }: GoalCardProps) {
  const name = VAULT_FRIENDLY_NAMES[vault.id] || vault.name;
  const apy = formatApy(vault.yield?.["7d"]);
  const accent = VAULT_ACCENTS[vault.id];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap(vault)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onTap(vault); }}
      className="w-full cursor-pointer overflow-hidden rounded-xl border p-5 text-left transition-[transform,box-shadow] duration-200 active:scale-[0.99]"
      style={{
        borderColor: accent?.border || "var(--color-border)",
        background: accent
          ? `linear-gradient(160deg, ${accent.bg} 0%, rgba(255,254,242,0.3) 100%)`
          : "transparent",
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="font-display italic text-[11px] text-ink-light/50">{name}</span>
          <p className="mt-1 font-display text-2xl leading-tight text-ink">{goal.name}</p>
        </div>
        <span
          className="mt-0.5 flex-none font-display italic text-base leading-none"
          style={{ color: accent?.color || "var(--color-sage)" }}
        >
          {apy}
        </span>
        {onRemoveGoal && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveGoal(); }}
            className="mt-0.5 flex-none p-1 text-ink-light/30 transition-colors duration-150 hover:text-ink-light/60"
            aria-label="Remove goal"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress track */}
      <div className="mt-4 h-px w-full rounded-full bg-ink/[0.08]">
        <div
          className="h-full min-w-[2px] rounded-full"
          style={{ width: "0%", backgroundColor: accent?.color || "var(--color-sage)" }}
        />
      </div>

      {/* Footer */}
      <div className="mt-2.5 flex items-center justify-between">
        <span
          className="font-body text-[11px]"
          style={{ color: accent?.color || "var(--color-sage)", opacity: 0.8 }}
        >
          Start saving
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-light/50">
          $0 / {formatUsd(goal.targetUsd)}
        </span>
      </div>
    </div>
  );
}
