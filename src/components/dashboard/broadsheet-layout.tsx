"use client";

import { usePrivy } from "@privy-io/react-auth";
import { motion } from "framer-motion";
import type { VaultStatsItem } from "@yo-protocol/core";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import type { ActivityItem } from "./activity-list";
import { useChatSheet } from "@/contexts/chat-context";
import { formatUsd, formatApy } from "@/lib/format";
import { VaultCard } from "./vault-card";
import { PositionCard } from "./position-card";
import { ActivityList } from "./activity-list";
import { SkeletonText, SkeletonCard, SkeletonRow } from "./skeleton";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

interface BroadsheetLayoutProps {
  className?: string;
  data: DashboardData;
  activities: ActivityItem[];
  goals: Record<string, { name: string; targetUsd: number }>;
  onVaultTap: (vault: VaultStatsItem) => void;
  onPositionTap: (vault: VaultStatsItem) => void;
}

export function BroadsheetLayout({
  className,
  data,
  activities,
  goals,
  onVaultTap,
  onPositionTap,
}: BroadsheetLayoutProps) {
  const { user } = usePrivy();
  const { open } = useChatSheet();

  const name =
    user?.google?.name?.split(" ")[0] ||
    (user?.apple as { firstName?: string } | undefined)?.firstName ||
    "there";

  const bestApy = data.baseVaults.reduce((best, v) => {
    const apy = parseFloat(v.yield?.["7d"] || "0");
    return apy > best ? apy : best;
  }, 0);

  return (
    <div className={`mx-auto max-w-6xl px-8 pt-20 pb-16 xl:px-12 ${className ?? ""}`}>
      {/* ── MASTHEAD ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease }}
      >
        <h1 className="font-display text-6xl italic leading-tight text-ink xl:text-7xl">
          Hey {name},
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease }}
      >
        {data.hasPositions ? (
          <p className="mt-4 max-w-2xl font-body text-xl leading-relaxed text-ink-light">
            Your savings are worth{" "}
            <span className="text-ink">{formatUsd(data.totalSavingsUsd)}</span>
            {bestApy > 0 && (
              <>
                , earning up to{" "}
                <span className="text-sage">{formatApy(String(bestApy))}</span>
              </>
            )}
            .
          </p>
        ) : (
          <>
            <p className="mt-4 max-w-2xl font-body text-xl leading-relaxed text-ink-light">
              You haven&apos;t started saving yet. Tell me what you&apos;re
              saving for and I&apos;ll help you get started.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Emergency fund", "Vacation", "Just earning"].map((goal) => (
                <button
                  key={goal}
                  onClick={() =>
                    open(
                      goal === "Just earning"
                        ? "I just want to earn the best interest on my money"
                        : `I want to start saving for ${goal.toLowerCase()}`,
                    )
                  }
                  className="rounded-lg border border-border bg-cream-dark/50 px-4 py-2 font-mono text-xs tracking-wide text-ink-light transition-all duration-300 hover:border-sage/40 hover:text-ink"
                >
                  {goal}
                </button>
              ))}
            </div>
          </>
        )}
      </motion.div>

      {/* ── TICKER STRIP ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease }}
        className="mt-8 border-t border-b border-border py-6"
      >
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="pr-8">
            <span className="label-mono">Balance</span>
            {data.userLoading ? (
              <div className="mt-2">
                <SkeletonText width="w-24" height="h-9" />
              </div>
            ) : (
              <p className="mt-2 font-display text-3xl text-ink xl:text-4xl">
                {formatUsd(data.walletBalanceUsd)}
              </p>
            )}
          </div>
          <div className="px-8">
            <span className="label-mono">Savings</span>
            {data.userLoading ? (
              <div className="mt-2">
                <SkeletonText width="w-24" height="h-9" />
              </div>
            ) : (
              <p className="mt-2 font-display text-3xl text-ink xl:text-4xl">
                {formatUsd(data.totalSavingsUsd)}
              </p>
            )}
          </div>
          <div className="pl-8">
            <span className="label-mono">Best Rate</span>
            {data.vaultsLoading ? (
              <div className="mt-2">
                <SkeletonText width="w-24" height="h-9" />
              </div>
            ) : (
              <p className="mt-2 font-display text-3xl text-sage xl:text-4xl">
                {formatApy(String(bestApy))}
              </p>
            )}
          </div>
        </div>
      </motion.section>

      {/* ── MAIN COLUMNS: Savings + Activity ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease }}
        className="mt-8 grid grid-cols-[3fr_2fr]"
      >
        {/* Savings */}
        <div className="pr-8">
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
                  goal={goals[p.vault.id]}
                  onTap={onPositionTap}
                />
              ))
            ) : (
              <div className="rounded-lg border border-border p-5">
                <p className="font-body text-sm text-ink-light">
                  No savings yet. Start a conversation below to set one up.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Activity */}
        <div className="border-l border-border pl-8">
          <span className="label-mono">Recent Activity</span>
          <div className="mt-4">
            <ActivityList activities={activities} />
          </div>
        </div>
      </motion.section>

      {/* ── MARKET DATA: Yields ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease }}
        className="mt-8 border-t border-border pt-8"
      >
        <span className="label-mono">Yields Available</span>
        <div className="mt-4 grid grid-cols-4 gap-4">
          {data.vaultsLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            data.baseVaults.map((vault) => (
              <VaultCard
                key={`${vault.id}-${vault.chain.id}`}
                vault={vault}
                onTap={onVaultTap}
              />
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
