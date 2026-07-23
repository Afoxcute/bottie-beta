import { tool } from "ai";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { DEMO_BILLS, DEMO_ASSETS } from "@/lib/demo-data";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";

export function createTools(walletAddress?: string, userId?: string) {
  return {
    // ── Bills ─────────────────────────────────────────────────────────────────

    get_bills: tool({
      description:
        "List all available bills and subscriptions — streaming, internet, cable, and utilities. Returns the full catalog with amounts and due dates.",
      inputSchema: z.object({
        category: z
          .enum(["streaming", "internet", "cable", "utility"])
          .optional()
          .describe("Filter by category"),
      }),
      execute: async ({ category }) => {
        const list = category
          ? DEMO_BILLS.filter((b) => b.category === category)
          : DEMO_BILLS;
        return {
          bills: list.map((b) => ({
            id: b.id,
            name: b.name,
            category: b.category,
            amount: b.amount,
            description: b.description,
            dueDay: b.dueDay,
          })),
          count: list.length,
        };
      },
    }),

    pay_bill: tool({
      description:
        "Queue a bill payment for user confirmation. Returns a pending action that renders a Confirm button in the UI — the actual USDC transfer and state update happen client-side when the user taps Confirm.",
      inputSchema: z.object({
        billName: z
          .string()
          .max(256)
          .optional()
          .describe("Bill name to pay, e.g. 'Netflix', 'Spotify', 'AT&T Fiber'"),
        billId: z
          .string()
          .max(64)
          .optional()
          .describe("Bill ID to pay (use the id from get_bills)"),
      }),
      execute: async ({ billName, billId }) => {
        if (!billName && !billId) return { error: "Provide a bill name or ID" };

        const bill = billId
          ? DEMO_BILLS.find((b) => b.id === billId)
          : DEMO_BILLS.find((b) =>
              b.name.toLowerCase().includes((billName ?? "").toLowerCase()),
            );

        if (!bill) {
          return {
            error: `Bill not found: ${billName ?? billId}. Use get_bills to see available options.`,
          };
        }

        // Return pending — the UI renders a confirm card that triggers arcKit.send()
        // from the user's Privy wallet and calls markBillPaid on success.
        return {
          pendingPayment: true,
          billId: bill.id,
          billName: bill.name,
          amount: bill.amount,
          icon: bill.icon,
          description: bill.description,
        };
      },
    }),

    // ── Investments ───────────────────────────────────────────────────────────

    get_investments: tool({
      description:
        "List available investments — stocks, pre-IPO companies, and ETFs with current prices and 24h change.",
      inputSchema: z.object({
        type: z
          .enum(["stock", "ipo", "etf", "all"])
          .optional()
          .describe("Filter by asset type"),
      }),
      execute: async ({ type }) => {
        const list =
          type && type !== "all"
            ? DEMO_ASSETS.filter((a) => a.type === type)
            : DEMO_ASSETS;
        return {
          assets: list.map((a) => ({
            symbol: a.symbol,
            name: a.name,
            type: a.type,
            priceUsd: a.priceUsd,
            change24h: a.change24h,
            description: a.description,
          })),
        };
      },
    }),

    buy_investment: tool({
      description:
        "Queue an investment purchase for user confirmation. Returns a pending action that renders a Confirm button in the UI — the actual USDC transfer and portfolio update happen client-side when the user taps Confirm.",
      inputSchema: z.object({
        symbol: z
          .string()
          .max(16)
          .describe("Ticker symbol to buy, e.g. AAPL, TSLA, SPACEX, SPY"),
        shares: z
          .string()
          .max(32)
          .describe("Number of shares to buy, e.g. '1', '0.5', '2'"),
      }),
      execute: async ({ symbol, shares }) => {
        const sym = symbol.toUpperCase();
        const asset = DEMO_ASSETS.find((a) => a.symbol === sym);

        if (!asset) {
          return {
            error: `Unknown symbol: ${sym}. Use get_investments to see available assets.`,
          };
        }

        const sharesNum = Number(shares);
        if (isNaN(sharesNum) || sharesNum <= 0) {
          return { error: "Invalid number of shares" };
        }

        // Return pending — the UI renders a confirm card that triggers arcKit.send()
        // from the user's Privy wallet and calls buyAsset on success.
        return {
          pendingPurchase: true,
          symbol: sym,
          assetName: asset.name,
          shares: sharesNum,
          priceUsd: asset.priceUsd,
          totalUsdc: sharesNum * asset.priceUsd,
          icon: asset.icon,
          type: asset.type,
        };
      },
    }),

    get_market_prices: tool({
      description:
        "Get current prices and 24h change for all available stocks, ETFs, and pre-IPO companies.",
      inputSchema: z.object({
        type: z
          .enum(["stock", "ipo", "etf", "all"])
          .optional()
          .describe("Filter by asset type"),
        symbol: z
          .string()
          .optional()
          .describe("Get details for a specific symbol"),
      }),
      execute: async ({ type, symbol }) => {
        let list = DEMO_ASSETS;
        if (symbol) {
          list = DEMO_ASSETS.filter((a) => a.symbol === symbol.toUpperCase());
        } else if (type && type !== "all") {
          list = DEMO_ASSETS.filter((a) => a.type === type);
        }
        return {
          assets: list.map((a) => ({
            symbol: a.symbol,
            name: a.name,
            type: a.type,
            priceUsd: a.priceUsd,
            change24h: a.change24h,
            description: a.description,
          })),
        };
      },
    }),

    get_payment_history: tool({
      description:
        "Fetch the user's payment history — bills paid and investments made.",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe("Number of records to return (default 20)"),
        type: z
          .enum(["bill", "investment"])
          .optional()
          .describe("Filter by payment type"),
      }),
      execute: async ({ limit, type }) => {
        if (!userId) return { error: "Not authenticated" };
        try {
          const cap = Math.min(limit ?? 20, 100);
          const records = await db
            .select()
            .from(payments)
            .where(eq(payments.userId, userId))
            .orderBy(desc(payments.createdAt))
            .limit(cap);

          const filtered = type
            ? records.filter((p) => p.type === type)
            : records;

          return {
            payments: filtered.map((p) => ({
              id: p.id,
              type: p.type,
              description: p.description,
              amountUsdc: p.amountUsdc,
              status: p.status,
              createdAt: p.createdAt,
            })),
          };
        } catch (err: any) {
          return { error: err?.message || "Failed to fetch payment history" };
        }
      },
    }),

    // ── Circle Gateway Nanopayments ────────────────────────────────────────────

    get_nanopay_balance: tool({
      description:
        "Check the agent's Circle Gateway nanopayments balance on Base Sepolia — both the wallet USDC balance and the spendable Gateway balance for gas-free payments.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!process.env.CIRCLE_BUYER_PRIVATE_KEY)
          return { error: "CIRCLE_BUYER_PRIVATE_KEY not configured" };
        try {
          const { getBuyerClient } = await import("@/lib/circle-gateway");
          const client = getBuyerClient();
          const balances = await client.getBalances();
          return {
            address: client.address,
            wallet: { usdc: balances.wallet.formatted },
            gateway: {
              available: balances.gateway.formattedAvailable,
              total: balances.gateway.formattedTotal,
            },
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch balances" };
        }
      },
    }),

    nanopay_deposit: tool({
      description:
        "Deposit USDC from the agent wallet into the Circle Gateway balance so it can make gas-free nanopayments.",
      inputSchema: z.object({
        amount: z
          .string()
          .describe("Amount of USDC to deposit, e.g. '1' for 1 USDC"),
      }),
      execute: async ({ amount }) => {
        if (!process.env.CIRCLE_BUYER_PRIVATE_KEY)
          return { error: "CIRCLE_BUYER_PRIVATE_KEY not configured" };
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0)
          return { error: "amount must be a positive number" };
        try {
          const { getBuyerClient } = await import("@/lib/circle-gateway");
          const client = getBuyerClient();
          const balances = await client.getBalances();
          const needed = BigInt(Math.round(amountNum * 1_000_000));
          if (balances.gateway.available >= needed) {
            return {
              skipped: true,
              message: "Gateway balance already sufficient",
              gateway: { available: balances.gateway.formattedAvailable },
            };
          }
          const result = await client.deposit(String(amount));
          return {
            depositTxHash: result.depositTxHash,
            amount: result.formattedAmount,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Deposit failed" };
        }
      },
    }),

    nanopay_pay: tool({
      description:
        "Pay for an x402-protected resource using Circle Gateway nanopayments (gas-free USDC). Provide the full URL of the resource.",
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe("The URL of the x402-protected resource to pay for"),
      }),
      execute: async ({ url }) => {
        if (!process.env.CIRCLE_BUYER_PRIVATE_KEY)
          return { error: "CIRCLE_BUYER_PRIVATE_KEY not configured" };
        try {
          const { getBuyerClient } = await import("@/lib/circle-gateway");
          const client = getBuyerClient();
          const support = await client.supports(url);
          if (!support.supported)
            return { error: "Target URL does not support Circle Gateway nanopayments" };
          const { data, status, formattedAmount, transaction } = await client.pay(url);
          return { status, data, paid: formattedAmount, transaction };
        } catch (err: any) {
          return { error: err?.message ?? "Payment failed" };
        }
      },
    }),

    nanopay_withdraw: tool({
      description:
        "Withdraw USDC from the Circle Gateway balance back to the agent wallet on Base Sepolia.",
      inputSchema: z.object({
        amount: z
          .string()
          .describe("Amount of USDC to withdraw, e.g. '0.5' for 0.5 USDC"),
      }),
      execute: async ({ amount }) => {
        if (!process.env.CIRCLE_BUYER_PRIVATE_KEY)
          return { error: "CIRCLE_BUYER_PRIVATE_KEY not configured" };
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0)
          return { error: "amount must be a positive number" };
        try {
          const { getBuyerClient } = await import("@/lib/circle-gateway");
          const client = getBuyerClient();
          const result = await client.withdraw(String(amount));
          return {
            mintTxHash: result.mintTxHash,
            amount: result.formattedAmount,
            chain: result.destinationChain,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Withdrawal failed" };
        }
      },
    }),
  };
}
