"use client";

import { motion } from "framer-motion";
import type { VaultStatsItem } from "@yo-protocol/core";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import { formatUsd } from "@/lib/format";
import { VaultCard } from "./vault-card";
import { PositionCard } from "./position-card";
import { ActivityList, type ActivityItem } from "./activity-list";
import { SkeletonText, SkeletonCard, SkeletonRow } from "./skeleton";

interface DetailsScreenProps {
  data: DashboardData;
  activities?: ActivityItem[];
  goals?: Record<string, { name: string; targetUsd: number }>;
  onVaultTap: (vault: VaultStatsItem) => void;
  onPositionTap: (vault: VaultStatsItem) => void;
}

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] as const },
});

export function DetailsScreen({
  data,
  activities,
  goals,
  onVaultTap,
  onPositionTap,
}: DetailsScreenProps) {
  return (
    <div className="min-h-[calc(100dvh-5rem)] overscroll-y-none px-6 pt-20 pb-8 sm:px-10">
      <div className="mx-auto w-full max-w-lg space-y-10">
        {/* YOUR ACCOUNTS — elevated with subtle sage tint on savings */}
        <motion.section {...stagger(0)}>
          <span className="label-mono">Your Accounts</span>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-cream p-4">
              <span className="label-mono text-[10px]">Balance</span>
              {data.userLoading ? (
                <div className="mt-1">
                  <SkeletonText width="w-16" height="h-7" />
                </div>
              ) : (
                <p className="mt-1 font-display text-2xl text-ink">
                  {formatUsd(data.walletBalanceUsd)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-sage/20 bg-sage/[0.04] p-4">
              <span className="label-mono text-[10px]">Savings</span>
              {data.userLoading ? (
                <div className="mt-1">
                  <SkeletonText width="w-16" height="h-7" />
                </div>
              ) : (
                <p className="mt-1 font-display text-2xl text-sage">
                  {formatUsd(data.totalSavingsUsd)}
                </p>
              )}
            </div>
          </div>
        </motion.section>

        {/* SAVINGS */}
        <motion.section {...stagger(1)}>
          <span className="label-mono">Savings</span>
          <div className="mt-4 space-y-3">
            {data.userLoading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : data.hasPositions ? (
              data.positions.map((p) => (
                <PositionCard
                  key={`${p.vault.id}-${p.vault.chain.id}`}
                  vault={p.vault}
                  position={p.position}
                  prices={data.prices}
                  goal={goals?.[p.vault.id]}
                  onTap={onPositionTap}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 p-6 text-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mx-auto mb-2 text-sage/30"
                >
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <p className="font-body text-sm text-ink-light">
                  No savings yet
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-ink-light/60">
                  Tap a vault below or ask the AI to get started
                </p>
              </div>
            )}
          </div>
        </motion.section>

        {/* YIELDS */}
        <motion.section {...stagger(2)}>
          <span className="label-mono">Yields Available</span>
          <div className="relative mt-4">
            <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {data.vaultsLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : (
                <>
                  {data.baseVaults.map((vault) => (
                    <VaultCard
                      key={`${vault.id}-${vault.chain.id}`}
                      vault={vault}
                      onTap={onVaultTap}
                    />
                  ))}
                  {/* Right spacer for last card visibility */}
                  <div className="w-3 flex-none" />
                </>
              )}
            </div>
            {/* Right fade hint */}
            <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-cream to-transparent" />
          </div>
        </motion.section>

        {/* RECENT ACTIVITY */}
        <motion.section {...stagger(3)}>
          <span className="label-mono">Recent Activity</span>
          <div className="mt-4">
            <ActivityList activities={activities ?? []} />
          </div>
        </motion.section>
      </div>
    </div>
  );
}
