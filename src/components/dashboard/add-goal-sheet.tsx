"use client";

import { useState, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { VaultStatsItem } from "@yo-protocol/core";
import { VAULT_FRIENDLY_NAMES } from "@/lib/constants";
import { formatApy } from "@/lib/format";
import { useChatSheet } from "@/contexts/chat-context";

interface AddGoalSheetProps {
  vault: VaultStatsItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddGoalSheet({ vault, onClose, onSuccess }: AddGoalSheetProps) {
  const { setActiveSheet } = useChatSheet();
  const [step, setStep] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [goalName, setGoalName] = useState("");
  const [sliderValue, setSliderValue] = useState(0); // 0–10000
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editValue, setEditValue] = useState("");

  const targetAmount = isEditingAmount ? Number(editValue) || 0 : sliderValue;

  const name = VAULT_FRIENDLY_NAMES[vault.id] || vault.name;
  const apy = formatApy(vault.yield?.["7d"]);

  const handleSaveRef = useRef<() => void>(() => {});
  const onCloseRef = useRef<() => void>(() => {});

  onCloseRef.current = onClose;
  handleSaveRef.current = async () => {
    if (!goalName.trim()) return;
    setStep("processing");
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId: vault.id,
          name: goalName.trim(),
          targetAmount: targetAmount > 0 ? String(targetAmount) : "0",
          currency: "USD",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStep("success");
      setTimeout(() => { onSuccess(); }, 1200);
    } catch {
      setStep("error");
    }
  };

  useLayoutEffect(() => {
    setActiveSheet({
      type: "goal",
      step,
      onConfirm: () => step === "error" ? setStep("idle") : handleSaveRef.current(),
      onCancel: () => onCloseRef.current(),
    });
    return () => setActiveSheet((prev) => prev?.type === "goal" ? null : prev);
  }, [step, setActiveSheet]);

  const handleAmountTap = useCallback(() => {
    setIsEditingAmount(true);
    setEditValue(targetAmount > 0 ? String(targetAmount) : "");
  }, [targetAmount]);

  const handleEditDone = useCallback(() => {
    const val = Number(editValue);
    if (!isNaN(val) && val >= 0) {
      setSliderValue(Math.min(val, 10000));
    }
    setIsEditingAmount(false);
  }, [editValue]);

  return createPortal(
    <>
      <motion.div
        key="goal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-ink/10"
        onClick={step === "idle" || step === "success" ? onClose : undefined}
      />
      <motion.div
        key="goal-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        drag={step === "idle" || step === "success" ? "y" : false}
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

        {step === "success" ? (
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
            <p className="font-display text-2xl text-ink">Goal set!</p>
          </div>
        ) : (
          <>
            {/* Goal name input */}
            <div className="mt-8">
              <p className="mb-2 font-mono text-[10px] text-ink-light">What are you saving for?</p>
              <input
                type="text"
                autoFocus
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="e.g. Emergency fund"
                className="w-full border-b border-border bg-transparent pb-2 font-body text-xl text-ink outline-none placeholder:text-ink-light/30"
              />
            </div>

            {/* Target amount display + slider */}
            <div className="mt-8 text-center">
              {isEditingAmount ? (
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={editValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d*$/.test(val)) setEditValue(val);
                  }}
                  onBlur={handleEditDone}
                  onKeyDown={(e) => e.key === "Enter" && handleEditDone()}
                  className="w-full bg-transparent text-center font-display text-4xl text-ink outline-none"
                />
              ) : (
                <button onClick={handleAmountTap} className="w-full text-center">
                  <span className="font-display text-4xl text-ink">
                    ${targetAmount.toLocaleString("en-US")}
                  </span>
                </button>
              )}
            </div>

            {/* Slider */}
            <div className="mt-6">
              <input
                type="range"
                min="0"
                max="10000"
                step="100"
                value={isEditingAmount ? Math.min(Number(editValue) || 0, 10000) : sliderValue}
                onChange={(e) => {
                  setIsEditingAmount(false);
                  setSliderValue(Number(e.target.value));
                }}
                className="slider-sage w-full"
              />
              <div className="mt-2 flex justify-between">
                <span className="font-mono text-[10px] text-ink-light">$0</span>
                <span className="font-mono text-[10px] text-ink-light">$10,000</span>
              </div>
            </div>

            {/* Save button moved to morphing chat bar */}
          </>
        )}
      </motion.div>
    </>,
    document.body,
  );
}
