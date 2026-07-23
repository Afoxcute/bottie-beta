"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useHandleLogin } from "@/hooks/use-handle-login";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export function Footer() {
  const handleLogin = useHandleLogin();
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.35 });

  return (
    <footer
      ref={sectionRef}
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16"
    >
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10 text-center">
        {/* Two-part statement */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
            transition={{ duration: 0.7, ease }}
            className="font-display italic text-2xl text-sage/70"
          >
            Your money deserves better.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
            transition={{ delay: 0.15, duration: 0.7, ease }}
            className="mt-3 font-display text-[clamp(2.5rem,11vw,3.5rem)] leading-tight tracking-tight text-ink text-balance"
          >
            Get started today.
          </motion.p>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.35, duration: 0.6, ease }}
        >
          <button
            onClick={handleLogin}
            className="group inline-flex items-center gap-3 rounded-full bg-sage py-2.5 pl-5 pr-2 font-body text-sm font-medium text-cream transition-[background-color,transform] duration-200 hover:bg-sage-light active:scale-[0.96]"
          >
            <span>Get started</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream/20 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M2.5 7h9M8 3.5L11.5 7 8 10.5"
                  stroke="var(--color-cream)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </motion.div>
      </div>

      {/* Attribution — anchored to bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-1.5"
      >
        <span className="font-mono text-[11px] tracking-[0.1em] text-ink-light/40">
          built with Bottie
        </span>
      </motion.div>
    </footer>
  );
}
