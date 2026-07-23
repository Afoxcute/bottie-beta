"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePrivy } from "@privy-io/react-auth";
import { useChatSheet } from "@/contexts/chat-context";
import { getUserFirstName, getTimeBasedGreeting } from "@/lib/user-display-name";
import { MessageBubble } from "./message-bubble";
import { ThinkingIndicator } from "./thinking-indicator";
import { ToolApprovalCard } from "./tool-approval-card";
import { ToolResultCard } from "./tool-result-card";

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
  const { user } = usePrivy();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const name = getUserFirstName(user);
  const greeting = getTimeBasedGreeting();

  const walletAddress = user?.smartWallet?.address ?? user?.wallet?.address;

  const bodyRef = useRef<Record<string, unknown>>({});
  bodyRef.current = {
    walletAddress,
    userName: name,
  };

  const transport = useMemo(() => {
    const liveBody: Record<string, unknown> = {};
    for (const key of ["walletAddress", "userName"]) {
      Object.defineProperty(liveBody, key, {
        get: () => bodyRef.current[key],
        enumerable: true,
      });
    }
    return new DefaultChatTransport({ api: "/api/chat", body: liveBody });
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

  // Auto-scroll to bottom when messages change (unless user scrolled up)
  useEffect(() => {
    if (!scrollRef.current || !visible) return;
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, visible]);

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
              const hasActionToolParts = message.parts.some(
                (p) => p.type.startsWith("tool-"),
              );

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
                  {message.role === "assistant" && !hasText && !hasActionToolParts && !isBusy && (
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
            {status === "error" && messages.length > 0 && messages[messages.length - 1].role === "user" && (
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
