"use client";

import { useBalance } from "wagmi";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const LOW_BALANCE_THRESHOLD_USD = 10;

export function useUsdcBalance(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useBalance({
    address,
    token: USDC_BASE_SEPOLIA,
  });

  const balance = data ? Number(data.formatted) : 0;
  // Only flag low balance when the wallet has been used (balance > 0) but is running low,
  // so new users with 0 USDC don't see the warning immediately on first login.
  const isLow = !isLoading && balance > 0 && balance < LOW_BALANCE_THRESHOLD_USD;
  const formatted = `$${balance.toFixed(2)}`;

  return { balance, formatted, isLow, isLoading, refetch };
}
