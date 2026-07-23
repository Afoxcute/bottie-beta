"use client";

import { useState, useEffect, useCallback } from "react";

export interface Bill {
  id: string;
  userId: string;
  name: string;
  category: string;
  amount: string;
  dueDate: string | null;
  payeeAddress: string | null;
  autopay: boolean;
  status: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useBills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bills");
      if (!res.ok) throw new Error("Failed to fetch bills");
      const data = await res.json();
      setBills(data.bills ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const addBill = useCallback(
    async (payload: {
      name: string;
      category: string;
      amount: string;
      dueDate?: string;
      autopay?: boolean;
    }) => {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to add bill");
      }
      const data = await res.json();
      setBills((prev) => [data.bill, ...prev]);
      return data.bill as Bill;
    },
    []
  );

  const updateBill = useCallback(
    async (id: string, patch: { status?: string; autopay?: boolean; amount?: string; dueDate?: string }) => {
      const res = await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to update bill");
      }
      const data = await res.json();
      setBills((prev) => prev.map((b) => (b.id === id ? data.bill : b)));
      return data.bill as Bill;
    },
    []
  );

  const deleteBill = useCallback(async (id: string) => {
    const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error ?? "Failed to delete bill");
    }
    setBills((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const payBill = useCallback(
    async (id: string) => {
      return updateBill(id, { status: "paid" });
    },
    [updateBill]
  );

  const totalDue = bills
    .filter((b) => b.status !== "paid")
    .reduce((sum, b) => sum + Number(b.amount), 0);

  return { bills, loading, error, refetch: fetch_, addBill, updateBill, deleteBill, payBill, totalDue };
}
