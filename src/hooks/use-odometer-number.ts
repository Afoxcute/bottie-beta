"use client";

import { useMemo } from "react";

export interface DigitConfig {
  type: "digit" | "symbol";
  value: string | number;
  index: number;
}

interface UseOdometerNumberOptions {
  value: number;
  format?: (value: number) => string;
}

export function useOdometerNumber({
  value,
  format = (v) => v.toFixed(2),
}: UseOdometerNumberOptions): DigitConfig[] {
  return useMemo(() => {
    const formattedValue = format(value);

    return formattedValue.split("").map((char, index) => {
      const isDigit = /\d/.test(char);

      if (isDigit) {
        return { type: "digit" as const, value: parseInt(char, 10), index };
      } else {
        return { type: "symbol" as const, value: char, index };
      }
    });
  }, [value, format]);
}
