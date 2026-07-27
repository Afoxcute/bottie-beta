"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { useChatSheet } from "@/contexts/chat-context";
import { getUserFirstName, getTimeBasedGreeting } from "@/lib/user-display-name";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { useDemoState } from "@/contexts/demo-state-context";
import { useSolanaBalance } from "@/hooks/use-solana-balance";
import { MessageBubble } from "./message-bubble";
import { ThinkingIndicator } from "./thinking-indicator";
import { ToolApprovalCard } from "./tool-approval-card";
import { ToolResultCard } from "./tool-result-card";

const ER_RPC = "https://flash.magicblock.xyz";

// Perpetuals instructions target the MagicBlock ER validator directly.
// Everything else (WithAction: swap, liquidity, staking, rewards, migration, referral) goes to base Solana.
const ER_ACTIONS = new Set([
  "open_position", "close_position", "increase_position",
  "add_collateral", "remove_collateral",
  "limit_order", "trigger_order", "cancel_order", "cancel_all_triggers",
  "edit_limit_order", "edit_trigger_order",
]);

const FLASH_ACTION_LABELS: Record<string, string> = {
  open_position: "Open Position",
  close_position: "Close Position",
  limit_order: "Place Limit Order",
  trigger_order: "Place Trigger",
  cancel_order: "Cancel Order",
  add_collateral: "Add Collateral",
  remove_collateral: "Remove Collateral",
  swap: "Swap Tokens",
  add_liquidity: "Add Liquidity",
  remove_liquidity: "Remove Liquidity",
  add_compounding: "Add sFLP Liquidity",
  remove_compounding: "Remove sFLP Liquidity",
  stake_flash: "Stake FLASH",
  unstake_flash: "Unstake FLASH",
  cancel_unstake: "Cancel Unstake",
  withdraw_flash: "Withdraw FLASH",
  collect_stake_reward: "Collect Staking Rewards",
  collect_flp_reward: "Collect FLP Rewards",
  collect_rebate: "Collect Rebates",
  collect_revenue: "Collect Referral Revenue",
  cancel_all_triggers: "Cancel All Triggers",
  migrate_to_sflp: "Migrate FLP → sFLP",
  migrate_to_flp: "Migrate sFLP → FLP",
  deposit_to_vault: "Deposit to Trade Vault",
  withdraw_from_vault: "Withdraw from Trade Vault",
  increase_position: "Increase Position",
  edit_limit_order: "Edit Limit Order",
  edit_trigger_order: "Edit Trigger Order",
  revoke_session: "End Trading Session",
  create_referral: "Set Referral",
};

const SESSION_KEY = "flash_session_keypair";
const SOL_RPC = "https://api.mainnet-beta.solana.com";

function loadActiveSession(): { keypair: Keypair; expiresAt: number } | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (!raw) return null;
    const { secretKey, expiresAt } = JSON.parse(raw) as { secretKey: number[]; expiresAt: number };
    if (Date.now() >= expiresAt) return null;
    return { keypair: Keypair.fromSecretKey(new Uint8Array(secretKey)), expiresAt };
  } catch { return null; }
}

function FlashTxApprovalCard({
  toolCallId,
  output,
  addToolResult,
}: {
  toolCallId: string;
  output: { pendingFlashTx: true; action: string; args: Record<string, unknown>; transaction: string; solanaAddress: string };
  addToolResult: (args: { tool: string; toolCallId: string; output: unknown }) => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = FLASH_ACTION_LABELS[output.action] ?? output.action.replace(/_/g, " ");
  const isErAction = ER_ACTIONS.has(output.action);
  const session = isErAction ? loadActiveSession() : null;
  const usesSession = session !== null;

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      const rpcUrl = isErAction ? ER_RPC : SOL_RPC;
      const conn = new Connection(rpcUrl, "confirmed");
      let sig: string;

      if (usesSession && session) {
        // Session key is active — sign with it directly, no wallet popup needed
        const txBuf = Buffer.from(output.transaction, "base64");
        const tx = Transaction.from(txBuf);
        const { blockhash } = await conn.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.sign(session.keypair);
        sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      } else {
        // No session — fall back to Privy wallet signature
        const raw = Buffer.from(output.transaction, "base64");
        const signed: Uint8Array = await (signTransaction as any)({ transaction: raw });
        sig = await conn.sendRawTransaction(signed, { skipPreflight: false });
      }

      await conn.confirmTransaction(sig, "confirmed");
      setDone(true);
      addToolResult({ tool: `flash_${output.action}`, toolCallId, output: { success: true, signature: sig, action: output.action } });
    } catch (err: any) {
      const msg = err?.message ?? "Transaction failed";
      setError(msg);
      addToolResult({ tool: `flash_${output.action}`, toolCallId, output: { success: false, error: msg } });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = () => {
    addToolResult({ tool: `flash_${output.action}`, toolCallId, output: { success: false, error: "User rejected" } });
    setDone(true);
  };

  if (done && !error) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
        ✓ {label} sent on-chain
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚡</span>
        <div>
          <p className="font-medium text-ink text-sm">{label}</p>
          <p className="text-xs text-ink/50">
            Flash Trade · Solana{usesSession ? " · Session key active" : ""}
          </p>
        </div>
      </div>
      {Object.entries(output.args).length > 0 && (
        <div className="rounded-lg bg-ink/5 p-2 text-xs space-y-1">
          {Object.entries(output.args).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-ink/50">{k.replace(/_/g, " ")}</span>
              <span className="text-ink font-mono">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
      {usesSession && (
        <p className="text-xs text-blue-400/80">
          Trading session active — no wallet popup required.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleReject}
          disabled={busy}
          className="flex-1 rounded-lg border border-border py-2 text-sm text-ink/60 hover:bg-ink/5 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleApprove}
          disabled={busy}
          className="flex-1 rounded-lg bg-ink py-2 text-sm font-medium text-cream hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {busy ? "Executing…" : usesSession ? "Execute" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

function FlashSessionApprovalCard({
  toolCallId,
  output,
  addToolResult,
}: {
  toolCallId: string;
  output: { pendingFlashSession: true; action: string; args: { durationHours: number }; solanaAddress: string };
  addToolResult: (args: { tool: string; toolCallId: string; output: unknown }) => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setBusy(true); setError(null);
    try {
      const sessionKp = Keypair.generate();
      const sessionPubkey = sessionKp.publicKey.toBase58();

      // Fetch the real tx now that we have a session pubkey
      const r = await fetch("/api/flash/create-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: output.solanaAddress,
          sessionSignerPubkey: sessionPubkey,
          durationHours: output.args.durationHours,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { transaction: base64Tx } = await r.json() as { transaction: string };

      // Session keypair partial-signs first
      const txBuf = Buffer.from(base64Tx, "base64");
      const tx = Transaction.from(txBuf);
      tx.partialSign(sessionKp);
      const partialB64 = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");

      // Owner wallet (Privy) signs
      const signed: Uint8Array = await (signTransaction as any)({ transaction: Buffer.from(partialB64, "base64") });
      const conn = new Connection(SOL_RPC, "confirmed");
      const sig = await conn.sendRawTransaction(signed, { skipPreflight: false });
      await conn.confirmTransaction(sig, "confirmed");

      const expiresAt = Date.now() + output.args.durationHours * 60 * 60 * 1000;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ pubkey: sessionPubkey, secretKey: Array.from(sessionKp.secretKey), expiresAt }));

      setDone(true);
      addToolResult({ tool: "flash_create_session", toolCallId, output: { success: true, signature: sig, sessionPubkey, expiresAt } });
    } catch (err: any) {
      const msg = err?.message ?? "Failed";
      setError(msg);
      addToolResult({ tool: "flash_create_session", toolCallId, output: { success: false, error: msg } });
    } finally { setBusy(false); }
  };

  const handleReject = () => {
    addToolResult({ tool: "flash_create_session", toolCallId, output: { success: false, error: "User rejected" } });
    setDone(true);
  };

  if (done && !error) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
        ✓ Trading session created — Bottie can now trade without wallet popups
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔑</span>
        <div>
          <p className="font-medium text-ink text-sm">Start Trading Session</p>
          <p className="text-xs text-ink/50">Flash Trade · Solana · {output.args.durationHours}h</p>
        </div>
      </div>
      <div className="rounded-lg bg-ink/5 p-2 text-xs space-y-1">
        <div className="flex justify-between gap-2">
          <span className="text-ink/50">Duration</span>
          <span className="text-ink font-mono">{output.args.durationHours}h</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-ink/50">Scope</span>
          <span className="text-ink">Flash Trade perpetuals only</span>
        </div>
      </div>
      <p className="text-xs text-ink/40">A temporary keypair will be generated in your browser. You sign once to approve it, then trades run without further popups.</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleReject} disabled={busy} className="flex-1 rounded-lg border border-border py-2 text-sm text-ink/60 hover:bg-ink/5 transition-colors">Cancel</button>
        <button onClick={handleApprove} disabled={busy} className="flex-1 rounded-lg bg-ink py-2 text-sm font-medium text-cream hover:opacity-80 transition-opacity disabled:opacity-50">
          {busy ? "Creating…" : "Approve"}
        </button>
      </div>
    </div>
  );
}

function FlashRevokeSessionCard({
  toolCallId,
  output,
  addToolResult,
}: {
  toolCallId: string;
  output: { pendingFlashRevoke: true; solanaAddress: string };
  addToolResult: (args: { tool: string; toolCallId: string; output: unknown }) => void;
}) {
  const { signTransaction } = useSignTransaction();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setBusy(true); setError(null);
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
      if (!raw) throw new Error("No active session found in this browser");
      const { pubkey: sessionSignerPubkey } = JSON.parse(raw) as { pubkey: string };

      const r = await fetch("/api/flash/revoke-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAddress: output.solanaAddress, sessionSignerPubkey }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { transaction: base64Tx } = await r.json() as { transaction: string };

      const signed: Uint8Array = await (signTransaction as any)({ transaction: Buffer.from(base64Tx, "base64") });
      const conn = new Connection(SOL_RPC, "confirmed");
      const sig = await conn.sendRawTransaction(signed, { skipPreflight: false });
      await conn.confirmTransaction(sig, "confirmed");

      if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
      setDone(true);
      addToolResult({ tool: "flash_revoke_session", toolCallId, output: { success: true, signature: sig } });
    } catch (err: any) {
      const msg = err?.message ?? "Failed";
      setError(msg);
      addToolResult({ tool: "flash_revoke_session", toolCallId, output: { success: false, error: msg } });
    } finally { setBusy(false); }
  };

  const handleReject = () => {
    addToolResult({ tool: "flash_revoke_session", toolCallId, output: { success: false, error: "User cancelled" } });
    setDone(true);
  };

  if (done && !error) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
        ✓ Trading session ended
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔒</span>
        <div>
          <p className="font-medium text-ink text-sm">End Trading Session</p>
          <p className="text-xs text-ink/50">Flash Trade · Solana</p>
        </div>
      </div>
      <p className="text-xs text-ink/50">This will revoke the session keypair on-chain. Future trades will require your wallet signature again.</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleReject} disabled={busy} className="flex-1 rounded-lg border border-border py-2 text-sm text-ink/60 hover:bg-ink/5 transition-colors">Cancel</button>
        <button onClick={handleApprove} disabled={busy} className="flex-1 rounded-lg bg-ink py-2 text-sm font-medium text-cream hover:opacity-80 transition-opacity disabled:opacity-50">
          {busy ? "Revoking…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

interface ChatSheetProps {
  visible: boolean;
}

export function ChatSheet({ visible }: ChatSheetProps) {
  const {
    close,
    prefill,
    clearPrefill,
    dashboardData,
    registerSendMessage,
    setIsStreaming: setCtxStreaming,
    setChatInput,
  } = useChatSheet();
  const { user, getAccessToken } = usePrivy();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const name = getUserFirstName(user);
  const greeting = getTimeBasedGreeting();

  const { paidBillIds } = useDemoState();

  const accounts = (user?.linkedAccounts as any[]) ?? [];
  const walletAddress = user?.smartWallet?.address ?? user?.wallet?.address;
  const evmWallet = accounts.find((a: any) => a.chainType === "ethereum" && a.walletClientType === "privy");
  const { balance: walletBalance } = useUsdcBalance(walletAddress as `0x${string}` | undefined, evmWallet?.id);

  const solanaWallet = accounts.find((a: any) => a.type === "wallet" && a.chainType === "solana" && a.walletClientType === "privy");
  const solanaAddress = solanaWallet?.address as string | undefined;
  const { balance: solanaBalance } = useSolanaBalance(solanaAddress, solanaWallet?.id);

  const bodyRef = useRef<Record<string, unknown>>({});
  bodyRef.current = {
    walletAddress,
    solanaAddress,
    userName: name,
    walletBalance,
    solanaBalance,
    paidBillIds,
  };

  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  const transport = useMemo(() => {
    const liveBody: Record<string, unknown> = {};
    for (const key of ["walletAddress", "solanaAddress", "userName", "walletBalance", "solanaBalance", "paidBillIds"]) {
      Object.defineProperty(liveBody, key, {
        get: () => bodyRef.current[key],
        enumerable: true,
      });
    }
    return new DefaultChatTransport({
      api: "/api/chat",
      body: liveBody,
      headers: async (): Promise<Record<string, string>> => {
        const token = await getAccessTokenRef.current();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, sendMessage, addToolResult, status } = useChat({
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  useEffect(() => {
    setCtxStreaming(isBusy);
  }, [isBusy, setCtxStreaming]);

  // Register send for external input bar
  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || isBusy) return;
      userScrolledRef.current = false;
      sendMessage({ text });
      setChatInput("");
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    },
    [isBusy, sendMessage, setChatInput],
  );

  useEffect(() => {
    registerSendMessage(handleSend);
  }, [handleSend, registerSendMessage]);

  useEffect(() => {
    if (prefill) {
      setChatInput(prefill);
      clearPrefill();
    }
  }, [prefill, clearPrefill, setChatInput]);

  // Detect manual scroll-up to stop auto-following
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      // If user scrolled away from bottom, stop auto-following
      if (!isNearBottom && isBusy) {
        userScrolledRef.current = true;
      }
      // If user scrolls back to bottom, resume auto-following
      if (isNearBottom) {
        userScrolledRef.current = false;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isBusy]);

  // Auto-scroll to bottom when messages change or streaming ends (unless user scrolled up).
  // setTimeout lets the DOM paint the new content (e.g. Confirm card) before measuring scrollHeight.
  useEffect(() => {
    if (!scrollRef.current || !visible) return;
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    const id = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 60);
    return () => clearTimeout(id);
  }, [messages, status, visible]);

  return (
    <>
      {/* Backdrop */}
      {visible && (
        <div
          className="fixed inset-0 z-40 bg-ink/10 transition-opacity duration-300"
          onClick={close}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[85dvh] max-w-lg flex-col rounded-t-2xl border-t border-border bg-cream transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-w-xl ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Fix 5: Centered Bottie logo, tappable to close */}
        <div className="flex-none px-5 pt-3 pb-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
          <div className="flex justify-center">
            <button
              onClick={close}
              className="transition-opacity hover:opacity-60"
            >
              <img src="/Bottie.jpg" alt="Bottie" className="h-8 w-8 rounded-full object-cover" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-4 pb-[calc(5rem+max(env(safe-area-inset-bottom),0px))]">
          <div className="space-y-4">
            {/* Welcome message — shown when chat is empty */}
            {messages.length === 0 && (
              <div className="py-6">
                <p className="font-display text-[1.4rem] leading-snug text-ink">
                  {greeting}{name ? `, ${name}` : ""}. 👋
                </p>
                <p className="mt-3 font-body text-[1rem] leading-relaxed text-ink/60">
                  I&rsquo;m Bottie, your financial assistant. Ask me to pay your bills, invest in stocks, or check your portfolio.
                </p>
              </div>
            )}
            {messages.map((message) => {
              const hasText = message.parts.some(
                (p) => p.type === "text" && p.text.trim(),
              );
              const hasVisibleToolPart = message.parts.some((p) => {
                if (!p.type.startsWith("tool-") || !("toolCallId" in p)) return false;
                const tp = p as { type: string; state: string; output?: unknown };
                const tn = tp.type.slice(5);
                if (["deposit", "withdraw", "swap_and_deposit", "swap"].includes(tn)) return true;
                if (tn.startsWith("flash_")) return tp.state === "output-available";
                return tp.state === "output-available" && !!tp.output;
              });

              return (
                <div key={message.id} data-role={message.role}>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageBubble key={i} role={message.role} text={part.text} />
                      );
                    }
                    if (part.type === "reasoning") return null;
                    if (part.type.startsWith("tool-") && "toolCallId" in part) {
                      const tp = part as {
                        type: string;
                        toolCallId: string;
                        state: string;
                        input?: unknown;
                        output?: unknown;
                      };
                      const toolName = tp.type.slice(5);

                      if (["deposit", "withdraw", "swap_and_deposit", "swap"].includes(toolName)) {
                        return (
                          <ToolApprovalCard
                            key={tp.toolCallId}
                            toolName={toolName as "deposit" | "withdraw" | "swap" | "swap_and_deposit"}
                            toolCallId={tp.toolCallId}
                            args={(tp.input as Record<string, string>) || {}}
                            state={tp.state}
                            result={tp.output}
                            addToolResult={addToolResult}
                            dashboardData={dashboardData}
                          />
                        );
                      }

                      if (
                        tp.state === "output-available" &&
                        tp.output &&
                        (tp.output as any)?.pendingFlashRevoke === true
                      ) {
                        return (
                          <FlashRevokeSessionCard
                            key={tp.toolCallId}
                            toolCallId={tp.toolCallId}
                            output={tp.output as any}
                            addToolResult={addToolResult}
                          />
                        );
                      }

                      if (
                        tp.state === "output-available" &&
                        tp.output &&
                        (tp.output as any)?.pendingFlashSession === true
                      ) {
                        return (
                          <FlashSessionApprovalCard
                            key={tp.toolCallId}
                            toolCallId={tp.toolCallId}
                            output={tp.output as any}
                            addToolResult={addToolResult}
                          />
                        );
                      }

                      if (
                        tp.state === "output-available" &&
                        tp.output &&
                        (tp.output as any)?.pendingFlashTx === true
                      ) {
                        return (
                          <FlashTxApprovalCard
                            key={tp.toolCallId}
                            toolCallId={tp.toolCallId}
                            output={tp.output as any}
                            addToolResult={addToolResult}
                          />
                        );
                      }

                      if (tp.state === "output-available" && tp.output) {
                        return (
                          <ToolResultCard key={tp.toolCallId} toolName={toolName} result={tp.output} />
                        );
                      }

                      return null;
                    }
                    return null;
                  })}
                  {message.role === "assistant" && !hasText && isBusy && (
                    <ThinkingIndicator />
                  )}
                  {message.role === "assistant" && !hasText && !hasVisibleToolPart && !isBusy && (
                    <MessageBubble role="assistant" text="Let me try that again — could you rephrase?" />
                  )}
                </div>
              );
            })}
            {/* Thinking indicator for submitted phase (before assistant message exists) */}
            {status === "submitted" && (
              <div data-role="assistant">
                <ThinkingIndicator />
              </div>
            )}
            {/* Error fallback when request fails without creating assistant message */}
            {status !== "submitted" && status !== "streaming" && messages.length > 0 && messages[messages.length - 1].role === "user" && (
              <div data-role="assistant">
                <MessageBubble role="assistant" text="Something went wrong — please try again." />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
