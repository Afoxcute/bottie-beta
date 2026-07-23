"use client";

import { useState, useEffect, useCallback } from "react";

export interface Payment {
  id: string;
  userId: string;
  type: string;
  referenceId: string | null;
  description: string;
  amountUsdc: string;
  status: string;
  txHash: string | null;
  createdAt: string;
}

export function usePayments(type?: "bill" | "investment") {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = type ? `/api/payments?type=${type}` : "/api/payments";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch payments");
      const data = await res.json();
      setPayments(data.payments ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { payments, loading, error, refetch: fetch_ };
}
