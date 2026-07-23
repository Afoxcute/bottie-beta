"use client";

import { useState, useEffect, useCallback } from "react";

interface Goal {
  id: string;
  userId: string;
  vaultId: string;
  name: string;
  targetAmount: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/goals");
      if (!res.ok) return;
      const data = await res.json();
      setGoals(data.goals || []);
    } catch {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/goals");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setGoals(data.goals || []);
      } catch {
        // silent fail
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { goals, isLoading, refetch };
}
