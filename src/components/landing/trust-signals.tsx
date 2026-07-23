"use client";

import { motion } from "framer-motion";

export function TrustSignals() {
  return (
    <section className="relative flex min-h-dvh flex-col justify-center px-6">
      {/* Ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 50%, rgba(143,174,130,0.05), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-3xl">
        <motion.p
          initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display italic text-2xl text-sage/70"
        >
          Built on trust
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 font-display text-3xl leading-snug text-ink sm:text-4xl"
        >
          Powered by <span className="text-sage">Circle</span> — secure,
          instant USDC payments settled directly from your wallet.
        </motion.p>
      </div>
    </section>
  );
}
