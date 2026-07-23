"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { parseUnits } from "viem";
import type { Address } from "viem";
import type { VaultStatsItem } from "@yo-protocol/core";
import {
  useTokenBalance,
  usePreviewDeposit,
} from "@yo-protocol/react";
import { usePrivy } from "@privy-io/react-auth";
import { useVaultDeposit } from "@/hooks/use-vault-tx";
import { formatUsd, formatApy, formatShares, getPrice } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { VAULT_FRIENDLY_NAMES, TOKEN_ADDRESSES } from "@/lib/constants";
import { useChatSheet } from "@/contexts/chat-context";

interface DepositSheetProps {
  vault: VaultStatsItem;
  prices: Record<string, number>;
  walletAssets?: { symbol: string; balance: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export function DepositSheet({
  vault,
  prices,
  walletAssets,
  onClose,
  onSuccess,
}: DepositSheetProps) {
  const { user } = usePrivy();
  const walletAddress = (user?.smartWallet?.address ?? user?.wallet?.address) as Address | undefined;
  const [sliderValue, setSliderValue] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  // Token selector: default to vault's native token, fall back to USDC if user has none
  const nativeSymbol = vault.asset.symbol;
  const availableTokens = useMemo(() => {
    if (!walletAssets?.length) return [nativeSymbol];
    const symbols = walletAssets.map((a) => a.symbol).filter((s) => TOKEN_ADDRESSES[s] || s === nativeSymbol);
    // Put native token first if present
    if (symbols.includes(nativeSymbol)) return [nativeSymbol, ...symbols.filter((s) => s !== nativeSymbol)];
    return symbols.length ? symbols : [nativeSymbol];
  }, [walletAssets, nativeSymbol]);

  const [selectedToken, setSelectedToken] = useState(() => {
    // Default to native if user has it, otherwise first available
    if (walletAssets?.some((a) => a.symbol === nativeSymbol && parseFloat(a.balance) > 0)) return nativeSymbol;
    const firstWithBalance = walletAssets?.find((a) => parseFloat(a.balance) > 0 && TOKEN_ADDRESSES[a.symbol]);
    return firstWithBalance?.symbol ?? nativeSymbol;
  });

  const tokenAddress = (selectedToken === nativeSymbol
    ? vault.asset.address
    : TOKEN_ADDRESSES[selectedToken] ?? vault.asset.address) as Address;
  const tokenDecimals = selectedToken === "USDC" || selectedToken === "USDT" ? 6
    : selectedToken === "EURC" ? 6
    : selectedToken === nativeSymbol ? vault.asset.decimals
    : 18;
  const vaultAddress = vault.contracts.vaultAddress as Address;

  const { balance } = useTokenBalance(tokenAddress, walletAddress);
  const tokenBalance = balance
    ? Number(balance.balance) / 10 ** tokenDecimals
    : 0;

  const amount = isEditing ? Number(editValue) || 0 : (sliderValue / 100) * tokenBalance;

  const parsedAmount = useMemo(() => {
    if (amount <= 0) return 0n;
    try {
      return parseUnits(amount.toFixed(tokenDecimals), tokenDecimals);
    } catch {
      return 0n;
    }
  }, [amount, tokenDecimals]);

  const { shares: previewShares } = usePreviewDeposit(
    vaultAddress,
    parsedAmount,
    { enabled: parsedAmount > 0n },
  );

  const { deposit, step, isLoading, isSuccess, hash, reset } = useVaultDeposit({
    vault: vaultAddress,
    onConfirmed: (txHash) => {
      logActivity({
        type: "deposit",
        amount: amount.toString(),
        tokenSymbol: vault.asset.symbol,
        vaultId: vault.id,
        txHash,
      });
      onSuccess();
    },
    onError: () => {},
  });

  const price = getPrice(prices, selectedToken) || 0;
  const usdValue = amount * price;
  const exceedsBalance = amount > tokenBalance;
  const canDeposit =
    parsedAmount > 0n && !exceedsBalance && !isLoading && step === "idle";

  const handleDeposit = useCallback(async () => {
    if (!canDeposit) return;
    await deposit({
      token: tokenAddress,
      amount: parsedAmount,
      chainId: vault.chain.id,
    });
  }, [canDeposit, deposit, tokenAddress, parsedAmount, vault.chain.id]);

  // Sync step to chat bar context — use refs to avoid infinite loop
  const { setActiveSheet } = useChatSheet();
  const handleDepositRef = useRef(handleDeposit);
  const resetRef = useRef(reset);
  const onCloseRef = useRef(onClose);
  handleDepositRef.current = handleDeposit;
  resetRef.current = reset;
  onCloseRef.current = onClose;

  useEffect(() => {
    setActiveSheet({
      type: "deposit",
      onConfirm: () => (step === "error" ? resetRef.current() : handleDepositRef.current()),
      onCancel: () => onCloseRef.current(),
      step,
    });
  }, [step, setActiveSheet]);

  useEffect(() => {
    return () => setActiveSheet(null);
  }, [setActiveSheet]);

  const handleAmountTap = useCallback(() => {
    setIsEditing(true);
    setEditValue(amount > 0 ? amount.toString() : "");
  }, [amount]);

  const handleEditDone = useCallback(() => {
    const val = Number(editValue);
    if (!isNaN(val) && val >= 0 && tokenBalance > 0) {
      setSliderValue(Math.min((val / tokenBalance) * 100, 100));
    }
    setIsEditing(false);
  }, [editValue, tokenBalance]);

  const name = VAULT_FRIENDLY_NAMES[vault.id] || vault.name;
  const apy = formatApy(vault.yield?.["7d"]);

  return createPortal(
    <>
      <motion.div
        key="deposit-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-ink/10"
        onClick={step === "idle" || isSuccess ? onClose : undefined}
      />
      <motion.div
        key="deposit-sheet"
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
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-xs text-ink-light">
                {vault.asset.symbol}
              </span>
              <span className="rounded-md bg-sage/10 px-1.5 py-0.5 font-mono text-[10px] text-sage">
                {apy}
              </span>
            </div>
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
            <p className="font-display text-2xl text-ink">Saved!</p>
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
            {/* Token selector — show when multiple tokens available */}
            {availableTokens.length > 1 && (
              <div className="mt-4 flex gap-2">
                {availableTokens.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => { setSelectedToken(sym); setSliderValue(0); setIsEditing(false); }}
                    className={`rounded-full px-3 py-1 font-mono text-[11px] transition-colors duration-200 ${
                      selectedToken === sym ? "bg-ink text-cream" : "bg-cream-dark text-ink-light"
                    }`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}

            {/* Amount display — tap to type */}
            <div className="mt-8 text-center">
              {isEditing ? (
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={editValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d*$/.test(val))
                      setEditValue(val);
                  }}
                  onBlur={handleEditDone}
                  onKeyDown={(e) => e.key === "Enter" && handleEditDone()}
                  className="w-full bg-transparent text-center font-display text-4xl text-ink outline-none"
                />
              ) : (
                <button
                  onClick={handleAmountTap}
                  disabled={isLoading}
                  className="w-full text-center"
                >
                  <span className="font-display text-4xl text-ink">
                    {amount > 0
                      ? amount.toLocaleString("en-US", {
                          maximumFractionDigits: 4,
                        })
                      : "0"}
                  </span>
                </button>
              )}
              <p className="mt-1 font-mono text-xs text-ink-light">
                {selectedToken}
                {usdValue > 0 && ` · ${formatUsd(usdValue)}`}
              </p>
              {exceedsBalance && (
                <p className="mt-1 font-mono text-[10px] text-fail">
                  Exceeds available balance
                </p>
              )}
            </div>

            {/* Slider */}
            <div className="mt-6">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={isEditing ? Math.min((Number(editValue) / tokenBalance) * 100, 100) || 0 : sliderValue}
                onChange={(e) => {
                  setIsEditing(false);
                  setSliderValue(Number(e.target.value));
                }}
                disabled={isLoading || tokenBalance === 0}
                className="slider-sage w-full"
              />
              <div className="mt-2 flex justify-between">
                <span className="font-mono text-[10px] text-ink-light">$0</span>
                <span className="font-mono text-[10px] text-ink-light">
                  {tokenBalance.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  {selectedToken}
                </span>
              </div>
            </div>

            {/* Preview */}
            {previewShares && previewShares > 0n && (
              <div className="mt-4 text-center">
                <span className="font-mono text-[10px] text-ink-light">
                  ~{formatShares(previewShares, vault.asset.decimals)} shares
                </span>
              </div>
            )}

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
