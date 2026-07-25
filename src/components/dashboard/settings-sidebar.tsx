"use client";

import { useState, useRef } from "react";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { formatUsd } from "@/lib/format";
import { getUserFirstName } from "@/lib/user-display-name";
import { useSolanaBalance } from "@/hooks/use-solana-balance";

interface SettingsSidebarProps {
  open: boolean;
  onClose: () => void;
  walletBalanceUsd?: number;
}

function CopyableWallet({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-sm text-ink transition-colors duration-200 hover:text-ink/60"
    >
      <span>{truncated}</span>
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sage">
          <path d="M3 7.5l2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ink/40">
          <rect x="5" y="5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 5V3.5A1.5 1.5 0 007.5 2h-4A1.5 1.5 0 002 3.5v4A1.5 1.5 0 003.5 9H5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
    </button>
  );
}

export function SettingsSidebar({
  open,
  onClose,
  walletBalanceUsd,
}: SettingsSidebarProps) {
  const { user } = usePrivy();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout } = useLogout({
    onSuccess: () => {
      queryClient.clear();
      router.push("/");
    },
  });

  const accounts = (user?.linkedAccounts as any[]) ?? [];
  const evmAddress = user?.smartWallet?.address ?? user?.wallet?.address;
  const solanaWallet = accounts.find((a: any) => a.type === "wallet" && a.chainType === "solana" && a.walletClientType === "privy");
  const solanaAddress = solanaWallet?.address as string | undefined;
  const { balance: solanaBalanceSol, isLoading: solBalLoading } = useSolanaBalance(solanaAddress, solanaWallet?.id);
  const email = user?.email?.address || user?.google?.email;
  const firstName = getUserFirstName(user) ?? "User";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <motion.div
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-10 flex flex-col bg-cream-dark pl-6 pr-[22%] pt-[max(env(safe-area-inset-top),48px)] pb-[max(env(safe-area-inset-bottom),24px)]"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      {/* Profile header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage/20">
          <span className="font-display text-base text-sage">
            {initial}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg text-ink">
            {firstName}
          </p>
          {email && (
            <p className="truncate font-mono text-[10px] text-ink-light">
              {email}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 h-px bg-ink/20" />

      {/* Wallet section */}
      <div className="mt-5 space-y-5">
        {(evmAddress || solanaAddress) && (
          <div className="space-y-3">
            {evmAddress && (
              <div>
                <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">EVM Wallet</span>
                <div className="mt-1.5">
                  <CopyableWallet address={evmAddress} />
                </div>
              </div>
            )}
            {solanaAddress && (
              <div>
                <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">Solana Wallet</span>
                <div className="mt-1.5">
                  <CopyableWallet address={solanaAddress} />
                </div>
              </div>
            )}
          </div>
        )}

        {walletBalanceUsd !== undefined && (
          <div>
            <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">EVM Balance</span>
            <p className="mt-1 font-display text-xl text-ink">
              {formatUsd(walletBalanceUsd)} <span className="text-sm text-ink-light">USDC</span>
            </p>
          </div>
        )}

        {solanaAddress && (
          <div>
            <span className="font-mono text-[10px] font-medium tracking-widest text-ink-light uppercase">Solana Balance</span>
            <p className="mt-1 font-display text-xl text-ink">
              {solBalLoading
                ? <span className="text-sm text-ink-light">Loading…</span>
                : <>${solanaBalanceSol.toFixed(2)} <span className="text-sm text-ink-light">USDC</span></>
              }
            </p>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Logout */}
      <button
        onClick={() => logout()}
        className="w-full rounded-xl border border-fail/30 bg-fail/[0.08] px-4 py-3 font-mono text-xs tracking-wide text-fail transition-colors duration-200 hover:bg-fail/15"
      >
        Log out
      </button>
    </motion.div>
  );
}

export function ScreenStackWrapper({
  open,
  onOpen,
  onClose,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const touch = useRef({ x: 0, y: 0 });

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onSwipeEnd = (e: React.TouchEvent, action: "open" | "close") => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (action === "open" && dx > 0) onOpen();
      if (action === "close" && dx < 0) onClose();
    }
  };

  return (
    <>
      {/* Left-edge swipe zone — invisible strip to detect swipe-to-open */}
      {!open && (
        <div
          className="fixed top-0 left-0 bottom-0 w-5"
          style={{ zIndex: 25 }}
          onTouchStart={onTouchStart}
          onTouchEnd={(e) => onSwipeEnd(e, "open")}
        />
      )}

      <motion.div
        animate={
          open
            ? { x: "82%", borderRadius: 40 }
            : { x: "0%", borderRadius: 0 }
        }
        transition={{
          x: { type: "spring", damping: 26, stiffness: 260 },
          borderRadius: open
            ? { type: "spring", damping: 26, stiffness: 260 }
            : { duration: 0.1 },
        }}
        className="relative z-20 min-h-dvh bg-cream"
        style={{
          overflow: open ? "hidden" : undefined,
          height: open ? "100dvh" : undefined,
          willChange: "transform",
          boxShadow: open
            ? "-6px 0 48px rgba(0,0,0,0.25), -2px 0 8px rgba(0,0,0,0.10)"
            : "none",
        }}
      >
        {/* Dark dim overlay — tap or swipe left to close */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 z-50 cursor-pointer bg-black/[0.20]"
              onTouchStart={onTouchStart}
              onTouchEnd={(e) => onSwipeEnd(e, "close")}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            />
          )}
        </AnimatePresence>
        {children}
      </motion.div>
    </>
  );
}
