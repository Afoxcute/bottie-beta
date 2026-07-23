"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";

interface ReceiveSheetProps {
  onClose: () => void;
}

export function ReceiveSheet({ onClose }: ReceiveSheetProps) {
  const { user } = usePrivy();
  const walletAddress = user?.smartWallet?.address ?? user?.wallet?.address ?? "";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return createPortal(
    <>
      <motion.div
        key="receive-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-ink/10"
        onClick={onClose}
      />
      <motion.div
        key="receive-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        drag="y"
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
          <span className="font-display text-xl text-ink">Receive</span>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors duration-200 hover:bg-ink/[0.04]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-ink-light">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Address */}
        <div className="mt-8">
          <p className="label-mono text-[10px]">Your wallet address</p>
          <div className="mt-3 rounded-xl border border-border bg-cream-dark p-4">
            <p className="break-all font-mono text-sm leading-relaxed text-ink">
              {walletAddress}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="mt-4 w-full rounded-full border border-border bg-cream-dark py-3 font-body text-sm text-ink transition-[background-color,transform] duration-200 hover:bg-border/50 active:scale-[0.96]"
          >
            {copied ? "Copied" : "Copy address"}
          </button>

          <p className="mt-4 text-center font-body text-xs text-ink-light/50">
            Share this address to receive tokens on Base
          </p>
        </div>
        {/* iOS Safari bottom gap extension */}
        <div className="absolute -bottom-48 inset-x-0 h-48 bg-cream" />
      </motion.div>
    </>,
    document.body,
  );
}
