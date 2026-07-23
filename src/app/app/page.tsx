"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useChatSheet } from "@/contexts/chat-context";
import { useDemoState } from "@/contexts/demo-state-context";
import { BillsScreen } from "@/components/dashboard/bills-screen";
import { InvestmentsScreen } from "@/components/dashboard/investments-screen";
import { PaymentsScreen } from "@/components/dashboard/payments-screen";
import { FundWalletSheet } from "@/components/dashboard/fund-wallet-sheet";
import { useUsdcBalance, LOW_BALANCE_THRESHOLD_USD } from "@/hooks/use-usdc-balance";
import { DEMO_BILLS, ASSET_PRICES } from "@/lib/demo-data";
import { getUserFirstName, getTimeBasedGreeting } from "@/lib/user-display-name";

type Tab = "bills" | "investments" | "payments" | "chat";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "bills",       label: "Bills",   icon: "🧾" },
  { key: "investments", label: "Invest",  icon: "📈" },
  { key: "payments",    label: "History", icon: "💳" },
  { key: "chat",        label: "Chat",    icon: "💬" },
];

function DashboardInner() {
  const { openSidebar, open: openChat } = useChatSheet();
  const { user } = usePrivy();
  const [activeTab, setActiveTab] = useState<Tab>("bills");
  const [showFundSheet, setShowFundSheet] = useState(false);
  const { paidBillIds, portfolio } = useDemoState();

  const agentAddress = user?.wallet?.address as `0x${string}` | undefined;
  const { balance: usdcBalance, isLow: balanceIsLow, formatted: balanceFormatted } =
    useUsdcBalance(agentAddress);
  const firstName = getUserFirstName(user);
  const greeting = getTimeBasedGreeting();

  const handleTabClick = (tab: Tab) => {
    if (tab === "chat") {
      openChat();
    } else {
      setActiveTab(tab);
    }
  };

  const monthlyBills = DEMO_BILLS.filter((b) => paidBillIds.includes(b.id)).reduce(
    (sum, b) => sum + b.amount,
    0
  );

  const portfolioValue = portfolio.reduce(
    (sum, p) => sum + p.shares * (ASSET_PRICES[p.symbol] ?? p.avgPriceUsd),
    0
  );

  const pendingCount = DEMO_BILLS.length - paidBillIds.length;

  return (
    <div className="relative min-h-dvh">
      {/* Header */}
      <div className="fixed top-0 right-0 left-0 z-30 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-cream-dark/80 backdrop-blur-sm">
        <button
          onClick={openSidebar}
          className="rounded-full p-2 transition-colors duration-200 hover:bg-ink/[0.04]"
          aria-label="Open settings"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-light">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="text-center">
          <p className="text-xs font-medium text-ink-light/50 uppercase tracking-wide">Bottie</p>
        </div>

        <button
          onClick={() => openChat()}
          className="rounded-full p-2 transition-colors duration-200 hover:bg-ink/[0.04]"
          aria-label="Open chat"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-light">
            <path
              d="M18 10c0 4.418-3.582 8-8 8a7.96 7.96 0 01-4-.107L2 19l1.107-4A7.96 7.96 0 012 10C2 5.582 5.582 2 10 2s8 3.582 8 8z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Low-balance banner */}
      {balanceIsLow && agentAddress && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+56px)] left-0 right-0 z-20 mx-5 mt-1">
          <div className="flex items-center justify-between rounded-xl bg-amber-900/30 border border-amber-700/40 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <span>⚠</span>
              <span className="font-medium">
                Low balance ({balanceFormatted}) — payments may fail
              </span>
            </div>
            <button
              onClick={() => setShowFundSheet(true)}
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-[#141513]"
            >
              Add Funds
            </button>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div
        className={`px-5 pb-2 pt-2 ${
          balanceIsLow && agentAddress
            ? "mt-[calc(env(safe-area-inset-top)+100px)]"
            : "mt-[calc(env(safe-area-inset-top)+56px)]"
        }`}
      >
        <p className="mb-3 text-lg font-semibold text-[#F2F0E8]">
          {greeting}{firstName ? `, ${firstName}` : ""} 👋
        </p>

        <div className="flex gap-3">
          {/* Bills card */}
          <div className="flex-1 rounded-2xl bg-[#1B1C19] border border-[#2A2B27] p-4">
            <p className="text-xs text-[#A7A79A] font-medium">Monthly Bills</p>
            <p className="text-xl font-bold text-[#F2F0E8] mt-0.5">
              ${monthlyBills.toFixed(2)}
            </p>
            {pendingCount > 0 && (
              <p className="text-xs text-amber-400 mt-0.5">{pendingCount} not subscribed</p>
            )}
          </div>

          {/* Portfolio card */}
          <div className="flex-1 rounded-2xl bg-[#1B1C19] border border-[#2A2B27] p-4">
            <p className="text-xs text-[#A7A79A] font-medium">Portfolio</p>
            <p className="text-xl font-bold text-[#F2F0E8] mt-0.5">
              ${portfolioValue.toFixed(2)}
            </p>
            <p className="text-xs text-green-400 mt-0.5">
              {portfolio.length} position{portfolio.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Wallet balance card */}
          {agentAddress && (
            <div
              className="w-[88px] shrink-0 cursor-pointer rounded-2xl border p-4 flex flex-col justify-between transition-colors hover:border-[#8FAE82]/50"
              style={{
                background: "#1B1C19",
                borderColor: balanceIsLow ? "rgba(251,191,36,0.4)" : "#2A2B27",
              }}
              onClick={() => setShowFundSheet(true)}
            >
              <p className="text-[10px] text-[#A7A79A] font-medium leading-tight">Wallet</p>
              <p
                className="text-sm font-bold mt-1 leading-tight"
                style={{ color: balanceIsLow ? "#fbbf24" : "#F2F0E8" }}
              >
                {balanceFormatted}
              </p>
              <p className="text-[10px] text-[#8FAE82] mt-1">+ Add</p>
            </div>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 flex gap-1 bg-cream-dark/90 backdrop-blur-sm px-5 py-2 border-b border-[#2A2B27]">
        {TABS.filter((t) => t.key !== "chat").map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabClick(tab.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors ${
              activeTab === tab.key
                ? "bg-[#F2F0E8] text-[#141513]"
                : "text-[#A7A79A] hover:bg-white/[0.04]"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {activeTab === "bills"       && <BillsScreen />}
        {activeTab === "investments" && <InvestmentsScreen />}
        {activeTab === "payments"    && <PaymentsScreen />}
      </div>

      {/* Fund wallet sheet */}
      {showFundSheet && agentAddress && (
        <FundWalletSheet
          agentAddress={agentAddress}
          onClose={() => setShowFundSheet(false)}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardInner />;
}
