"use client";

import type { FinancialData } from "@/contexts/chat-context";

type AddToolResultFn = (params: {
  tool: string;
  toolCallId: string;
  output: unknown;
}) => void;

interface ToolApprovalCardProps {
  toolName: "deposit" | "withdraw" | "swap_and_deposit" | "swap";
  toolCallId: string;
  args: Record<string, string>;
  state: string;
  result: unknown;
  addToolResult: AddToolResultFn;
  dashboardData: FinancialData | null;
}

/**
 * Legacy approval card — kept for structural compatibility.
 * The new app does not use deposit/withdraw/swap AI tools,
 * so this component should never render in practice.
 */
export function ToolApprovalCard({
  toolName,
  toolCallId,
  args,
  state,
  result,
  addToolResult,
}: ToolApprovalCardProps) {
  if (state === "output-available" || result) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed =
        typeof result === "string"
          ? JSON.parse(result)
          : (result as Record<string, unknown>);
    } catch {
      parsed = { success: false, error: "Invalid result" };
    }
    const success = parsed?.success;
    return (
      <div
        className={`my-2 rounded-xl border px-4 py-3 ${
          success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
        }`}
      >
        <p className="text-xs text-gray-600">
          {success
            ? `${toolName} completed`
            : String(parsed?.error || "Cancelled")}
        </p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs text-amber-700">
        Action &ldquo;{toolName}&rdquo; is not available in this version.
      </p>
    </div>
  );
}
