"use client";

import { createContext, useContext } from "react";

interface GoalsContextValue {
  goals: Record<string, { name: string; targetUsd: number }>;
  refetch: () => Promise<void>;
}

const GoalsContext = createContext<GoalsContextValue>({
  goals: {},
  refetch: async () => {},
});

export const GoalsProvider = GoalsContext.Provider;

export function useAppGoals() {
  return useContext(GoalsContext);
}
