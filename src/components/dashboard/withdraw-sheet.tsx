"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { Address } from "viem";
import type { VaultStatsItem, UserVaultPosition } from "@yo-protocol/core";
import {
  usePreviewRedeem,
  useShareBalance,
} from "@yo-protocol/react";
import { usePrivy } from "@privy-io/react-auth";
import { useVaultRedeem } from "@/hooks/use-vault-tx";
import { formatUsd, formatShares, assetsToUsd, getPrice } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";
import { useChatSheet } from "@/contexts/chat-context";

interface WithdrawSheetProps {
  vault: VaultStatsItem;
  position: UserVaultPosition;
  prices: Record<string, number>;
  onClose: () => void;
  onSuccess: () => void;
}

export function WithdrawSheet({
  vault,
  position,
  prices,
  onClose,
  onSuccess,
}: WithdrawSheetProps) {
  const { user } = usePrivy();
  const walletAddress = (user?.smartWallet?.address ?? user?.wallet?.address) as Address | undefined;
  const [sliderValue, setSliderValue] = useState(0);

  const vaultAddress = vault.contracts.vaultAddress as Address;

  const { shares: shareBalance } = useShareBalance(vaultAddress, walletAddress);
  const totalShares = shareBalance || position.shares;

  const redeemShares = useMemo(() => {
    if (sliderValue === 0 || !totalShares) return 0n;
    if (sliderValue === 100) return totalShares;
    return (totalShares * BigInt(sliderValue)) / 100n;
  }, [sliderValue, totalShares]);

  const { assets: previewAssets } = usePreviewRedeem(
    vaultAddress,
    redeemShares,
    { enabled: redeemShares > 0n },
  );

  const { redeem, step, isLoading, isSuccess, hash, instant, reset } =
    useVaultRedeem({
      vault: vaultAddress,
      onConfirmed: (txHash) => {
        logActivity({
          type: "withdraw",
          amount: withdrawAmount.toString(),
          tokenSymbol: vault.asset.symbol,
          vaultId: vault.id,
          txHash,
        });
        onSuccess();
      },
      onError: () => {},
    });

  const price = getPrice(prices, vault.asset.symbol) || 0;
  const positionUsd = assetsToUsd(
    position.assets,
    vault.asset.decimals,
    price,
  );
  const previewUsd = previewAssets
    ? assetsToUsd(previewAssets, vault.asset.decimals, price)
    : 0;
  const withdrawAmount = previewAssets
    ? Number(previewAssets) / 10 ** vault.asset.decimals
    : (sliderValue / 100) * (Number(position.assets) / 10 ** vault.asset.decimals);
  const canRedeem = redeemShares > 0n && !isLoading && step === "idle";

  const handleRedeem = useCallback(async () => {
    if (!canRedeem) return;
    await redeem(redeemShares);
  }, [canRedeem, redeem, redeemShares]);

  // Sync step to chat bar context — use refs to avoid infinite loop
  const { setActiveSheet } = useChatSheet();
  const handleRedeemRef = useRef(handleRedeem);
  const resetRef = useRef(reset);
  const onCloseRef = useRef(onClose);
  handleRedeemRef.current = handleRedeem;
  resetRef.current = reset;
  onCloseRef.current = onClose;

  useEffect(() => {
    setActiveSheet({
      type: "withdraw",
      onConfirm: () => (step === "error" ? resetRef.current() : handleRedeemRef.current()),
      onCancel: () => onCloseRef.current(),
      step,
    });
  }, [step, setActiveSheet]);

  useEffect(() => {
    return () => setActiveSheet(null);
  }, [setActiveSheet]);

  const name = VAULT_FRIENDLY_NAMES[vault.id] || vault.name;

  return createPortal(
    <>
      <motion.div
        key="withdraw-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-ink/10"
        onClick={step === "idle" || isSuccess ? onClose : undefined}
      />
      <motion.div
        key="withdraw-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        drag={step === "idle" || isSuccess ? "y" : false}
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) onClose();
        }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl border-t border-border bg-cream px-6 pb-[calc(max(env(safe-area-inset-bottom),24px)+72px)] pt-4"
      >
        {/* Drag handle */}
        <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-border" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="label-mono text-[10px]">{name}</span>
            <p className="mt-1 font-display text-xl text-ink">
              {formatUsd(positionUsd)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors duration-200 hover:bg-ink/[0.04]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-ink-light"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {isSuccess ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage/10">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="text-sage"
              >
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="font-display text-2xl text-ink">
              {instant ? "Withdrawn!" : "Withdrawal requested"}
            </p>
            {!instant && (
              <p className="text-center font-body text-sm text-ink-light">
                Your withdrawal is being processed. Funds will arrive
                automatically.
              </p>
            )}
            {hash && (
              <a
                href={`https://basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-sage underline"
              >
                View transaction
              </a>
            )}
          </div>
        ) : (
          <>
            {/* Amount display */}
            <div className="mt-8 text-center">
              <span className="font-display text-4xl text-ink">
                {withdrawAmount > 0
                  ? withdrawAmount.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })
                  : "0"}
              </span>
              <p className="mt-1 font-mono text-xs text-ink-light">
                {vault.asset.symbol}
                {previewUsd > 0 && ` · ${formatUsd(previewUsd)}`}
              </p>
            </div>

            {/* Slider */}
            <div className="mt-6">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                disabled={isLoading}
                className="slider-sage w-full"
              />
              <div className="mt-2 flex justify-between">
                <span className="font-mono text-[10px] text-ink-light">$0</span>
                <span className="font-mono text-[10px] text-ink-light">
                  {formatUsd(positionUsd)}
                </span>
              </div>
            </div>

            {/* Confirm button moved to morphing chat bar */}
          </>
        )}
        {/* iOS Safari bottom gap extension */}
        <div className="absolute -bottom-48 inset-x-0 h-48 bg-cream" />
      </motion.div>
    </>,
    document.body,
  );
}
