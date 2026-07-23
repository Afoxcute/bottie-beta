"use client";

import { useState, useEffect, useCallback } from "react";

export interface InvestmentPosition {
  id: string;
  userId: string;
  symbol: string;
  name: string;
  type: string;
  shares: string;
  avgPriceUsd: string;
  currentPriceUsd: string;
  currentValueUsd: string;
  gainLossUsd: string;
  description: string;
  assetType: string;
  createdAt: string;
  updatedAt: string;
}

export function useInvestments() {
  const [portfolio, setPortfolio] = useState<InvestmentPosition[]>([]);
  const [totalValueUsd, setTotalValueUsd] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investments");
      if (!res.ok) throw new Error("Failed to fetch investments");
      const data = await res.json();
      setPortfolio(data.portfolio ?? []);
      setTotalValueUsd(data.totalValueUsd ?? "0.00");
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const buyShares = useCallback(
    async (payload: { symbol: string; shares: number; pricePerShare?: number }) => {
      const res = await fetch("/api/investments/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Purchase failed");
      }
      const data = await res.json();
      // Refresh portfolio after buy
      await fetch_();
      return data;
    },
    [fetch_]
  );

  return { portfolio, totalValueUsd, loading, error, refetch: fetch_, buyShares };
}
