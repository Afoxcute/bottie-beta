"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useOdometerNumber } from "@/hooks/use-odometer-number";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/* ── Single digit with vertical scroll animation ─────────── */

interface OdometerDigitProps {
  digit: number;
  duration: number;
  ease: [number, number, number, number];
  prefersReducedMotion: boolean;
}

function OdometerDigit({
  digit,
  duration,
  ease,
  prefersReducedMotion,
}: OdometerDigitProps) {
  const clampedDigit = Math.max(0, Math.min(9, Math.floor(digit)));
  const hasMounted = useRef(false);

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  return (
    <div
      className="relative inline-block overflow-hidden align-baseline"
      style={{ height: "1em" }}
    >
      <motion.div
        className="flex flex-col"
        initial={{ y: `-${clampedDigit}em` }}
        animate={{ y: `-${clampedDigit}em` }}
        transition={
          prefersReducedMotion || !hasMounted.current
            ? { duration: 0 }
            : { duration, ease }
        }
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span
            key={d}
            className="block text-center"
            style={{ height: "1em", lineHeight: "1em" }}
            aria-hidden={d !== clampedDigit}
          >
            {d}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ── OdometerNumber — animated number display ────────────── */

interface OdometerNumberProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
  duration?: number;
  ease?: [number, number, number, number];
}

export function OdometerNumber({
  value,
  format,
  className,
  duration = 0.5,
  ease = [0.22, 1, 0.36, 1],
}: OdometerNumberProps) {
  const digits = useOdometerNumber({ value, format });
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <span className={`inline-flex items-baseline ${className || ""}`}>
      {digits.map((digit) =>
        digit.type === "digit" ? (
          <OdometerDigit
            key={digit.index}
            digit={Number(digit.value)}
            duration={duration}
            ease={ease}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <span key={digit.index}>
            {digit.value}
          </span>
        ),
      )}
    </span>
  );
}
