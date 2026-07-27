import { tool } from "ai";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { DEMO_BILLS, DEMO_ASSETS } from "@/lib/demo-data";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { getProvider } from "@/lib/banking/registry";

function getBankingProvider() {
  try { return getProvider("credible") as any; } catch { return null; }
}

export function createTools(walletAddress?: string, userId?: string, solanaAddress?: string, paidBillIds: string[] = []) {
  // Pick the right address for a given blockchain context
  function addressFor(blockchain?: string): string {
    const chain = (blockchain ?? "").toLowerCase();
    if (chain === "solana" && solanaAddress) return solanaAddress;
    return walletAddress ?? "";
  }
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
        const bills = list.map((b) => ({
          id: b.id,
          name: b.name,
          category: b.category,
          amount: b.amount,
          description: b.description,
          dueDay: b.dueDay,
          active: paidBillIds.includes(b.id),
        }));
        const activeCount = bills.filter((b) => b.active).length;
        return { bills, count: list.length, activeCount };
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

    // ── Solana Nanopayments (x402 / MPP via @solana/pay-kit) ─────────────────

    get_solpay_balance: tool({
      description:
        "Check the agent's Solana nanopayment wallet balance (SOL and USDC on Solana mainnet). This is a dedicated server wallet separate from the user's Solana wallet.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!process.env.SOLANA_AGENT_PRIVATE_KEY)
          return { error: "SOLANA_AGENT_PRIVATE_KEY not configured" };
        try {
          const { getSolPayBalance } = await import("@/lib/solana-pay-kit");
          return await getSolPayBalance();
        } catch (err: any) { return { error: err?.message ?? "Failed to fetch balance" }; }
      },
    }),

    solpay_pay: tool({
      description:
        "Pay for an x402 or MPP-protected resource using the agent's Solana wallet (USDC on Solana mainnet). Transparently handles the 402 handshake and retries the request after payment.",
      inputSchema: z.object({
        url: z.string().url().describe("Full URL of the x402 or MPP-protected resource to fetch and pay for"),
      }),
      execute: async ({ url }) => {
        if (!process.env.SOLANA_AGENT_PRIVATE_KEY)
          return { error: "SOLANA_AGENT_PRIVATE_KEY not configured" };
        try {
          const { solPayFetch } = await import("@/lib/solana-pay-kit");
          return await solPayFetch(url);
        } catch (err: any) { return { error: err?.message ?? "Payment failed" }; }
      },
    }),

    // ── Banking — Onramp (INR → Crypto) ──────────────────────────────────────

    get_onramp_pairs: tool({
      description:
        "List all available INR-to-crypto currency pairs for onramping (buying crypto with UPI). Returns pair IDs, blockchains, fee info, min/max amounts, and processing times.",
      inputSchema: z.object({}),
      execute: async () => {
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.getOnrampPairs();
          return { pairs: result.data ?? [] };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to load pairs" };
        }
      },
    }),

    get_onramp_quote: tool({
      description:
        "Get a live INR quote for buying crypto via UPI onramp. Returns the rate, platform fee, network fee, and total INR to pay. Call this before creating an order so the user can see the cost.",
      inputSchema: z.object({
        pair_id: z.string().describe("Currency pair ID from get_onramp_pairs, e.g. 'inr-usdt-solana'"),
        amount: z.number().positive().describe("Crypto amount the user wants to receive, in output currency units (e.g. 50 USDT)"),
      }),
      execute: async ({ pair_id, amount }) => {
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.getOnrampRate(pair_id, amount);
          const q = result.data;
          return {
            rate_inr_per_unit: q.rate,
            platform_fee_inr: q.fee_input,
            network_fee_inr: q.network_fee_input,
            total_inr_to_pay: Math.round(amount * q.rate + q.fee_input + q.network_fee_input),
            expires_at: q.expires_at,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch quote" };
        }
      },
    }),

    create_onramp_order: tool({
      description:
        "Create an onramp order so the user can buy crypto by paying INR via UPI. Only call this when the user explicitly confirms they want to proceed. Returns a UPI payment link the user can open in their UPI app, plus the order ID to track status.",
      inputSchema: z.object({
        pair_id: z.string().describe("Currency pair ID from get_onramp_pairs"),
        amount: z.number().positive().describe("Crypto amount to receive (in output currency units)"),
        first_name: z.string().describe("Customer first name"),
        last_name: z.string().describe("Customer last name"),
        blockchain: z.string().describe("Blockchain for this pair (e.g. 'solana', 'ethereum') — used to auto-select the right wallet"),
        destination_address: z.string().optional().describe("Override wallet address — leave blank to auto-use the user's wallet for the given blockchain"),
      }),
      execute: async ({ pair_id, amount, first_name, last_name, blockchain, destination_address }) => {
        if (!userId) return { error: "Not authenticated" };
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        const dest = destination_address?.trim() || addressFor(blockchain);
        if (!dest) return { error: "No wallet address available for this network. Ask the user to provide one." };
        try {
          const result = await provider.createOnrampOrder({ pair_id, amount, customer_id: userId, first_name, last_name, destination_address: dest });
          const o = result.data;
          return {
            order_id: o.order_id,
            upi_link: o.upi_intent,
            total_inr_to_pay: o.input_amount,
            rate: o.rate,
            expires_at: o.expires_at,
            instruction: `Open the UPI link in any UPI app (GPay, PhonePe, Paytm) to complete payment. Order ID: ${o.order_id}`,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to create order" };
        }
      },
    }),

    get_onramp_order: tool({
      description: "Check the current status of a specific onramp order by order ID.",
      inputSchema: z.object({
        order_id: z.string().describe("The onramp order ID to look up"),
      }),
      execute: async ({ order_id }) => {
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.getOnrampOrder(order_id);
          const o = result.data;
          return {
            order_id: o.order_id,
            status: o.status,
            input_amount_inr: o.input_amount,
            output_amount: o.output_amount,
            output_currency: o.output_currency,
            destination_address: o.destination_address,
            created_at: o.created_at,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch order" };
        }
      },
    }),

    list_onramp_orders: tool({
      description: "List the user's recent onramp (buy crypto with UPI) orders with their statuses.",
      inputSchema: z.object({
        limit: z.number().optional().describe("Number of orders to return (default 10)"),
        status: z.string().optional().describe("Filter by status: CREATED, PAYMENT_PENDING, PAYMENT_RECEIVED, WITHDRAWAL_INITIATED, CONFIRMATIONS_PENDING, COMPLETED, EXPIRED, FAILED"),
      }),
      execute: async ({ limit, status }) => {
        if (!userId) return { error: "Not authenticated" };
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.listOnrampOrders({ page: 0, limit: limit ?? 10, status, customer_id: userId });
          return {
            orders: (result.data ?? []).map((o: any) => ({
              order_id: o.order_id,
              status: o.status,
              input_amount_inr: o.input_amount,
              output_amount: o.output_amount,
              output_currency: o.output_currency,
              created_at: o.created_at,
            })),
            total: result.totalCount ?? 0,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to list orders" };
        }
      },
    }),

    // ── Banking — Offramp (Crypto → INR) ──────────────────────────────────────

    get_offramp_pairs: tool({
      description:
        "List all available crypto-to-INR currency pairs for offramping (selling crypto for INR). Returns pair IDs, blockchains, fee info, min/max amounts, and processing times.",
      inputSchema: z.object({}),
      execute: async () => {
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.getOfframpPairs();
          return { pairs: result.data ?? [] };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to load pairs" };
        }
      },
    }),

    get_offramp_quote: tool({
      description:
        "Get a live INR quote for selling crypto via offramp. Returns the rate, fees, and estimated INR the user will receive. Call this before creating an order.",
      inputSchema: z.object({
        pair_id: z.string().describe("Currency pair ID from get_offramp_pairs, e.g. 'usdt-inr-solana'"),
        amount: z.number().positive().describe("Crypto amount to sell, in input currency units (e.g. 50 USDT)"),
      }),
      execute: async ({ pair_id, amount }) => {
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.getOfframpRate(pair_id, amount);
          const q = result.data;
          return {
            rate_inr_per_unit: q.rate,
            platform_fee_inr: q.fee_input,
            network_fee_inr: q.network_fee_input,
            estimated_inr_received: Math.max(0, Math.round(amount * q.rate - q.fee_input - q.network_fee_input)),
            expires_at: q.expires_at,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch quote" };
        }
      },
    }),

    get_offramp_bank_accounts: tool({
      description: "List the user's saved INR payout bank accounts for offramping. Returns bank name, masked account number, IFSC, and account holder name.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!userId) return { error: "Not authenticated" };
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.listBankAccounts(userId);
          return { bank_accounts: result.data ?? [] };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to load bank accounts" };
        }
      },
    }),

    add_offramp_bank_account: tool({
      description:
        "Add a new INR payout bank account for the user. Credible verifies it via penny-drop. Only call when the user explicitly provides their account details and wants to add it.",
      inputSchema: z.object({
        first_name: z.string().describe("Account holder first name"),
        last_name: z.string().describe("Account holder last name"),
        account_number: z.string().describe("Bank account number"),
        ifsc: z.string().describe("Bank branch IFSC code, e.g. HDFC0001234"),
      }),
      execute: async ({ first_name, last_name, account_number, ifsc }) => {
        if (!userId) return { error: "Not authenticated" };
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.addBankAccount({ customer_id: userId, first_name, last_name, account_number, ifsc });
          const a = result.data;
          return {
            bank_account_id: a.bank_account_id,
            bank_name: a.bank_name,
            account_number: a.account_number,
            account_holder_name: a.account_holder_name,
            ifsc: a.ifsc,
            verified: true,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to add bank account" };
        }
      },
    }),

    create_offramp_order: tool({
      description:
        "Create an offramp order so the user can sell crypto and receive INR in their bank account. Only call when the user explicitly confirms. Returns a deposit address — the user sends crypto there and INR lands in their bank.",
      inputSchema: z.object({
        pair_id: z.string().describe("Currency pair ID from get_offramp_pairs"),
        amount: z.number().positive().describe("Crypto amount to sell (in input currency units)"),
        first_name: z.string().describe("Customer first name"),
        last_name: z.string().describe("Customer last name"),
        bank_account_id: z.string().describe("Bank account ID from get_offramp_bank_accounts"),
      }),
      execute: async ({ pair_id, amount, first_name, last_name, bank_account_id }) => {
        if (!userId) return { error: "Not authenticated" };
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.createOfframpOrder({ pair_id, amount, customer_id: userId, first_name, last_name, bank_account_id });
          const o = result.data;
          return {
            order_id: o.order_id,
            deposit_address: o.deposit_address,
            blockchain: o.blockchain,
            send_exactly: `${o.input_amount} ${o.input_currency}`,
            estimated_inr: o.output_amount,
            expires_at: o.expires_at,
            instruction: `Send exactly ${o.input_amount} ${o.input_currency} to the deposit address on ${o.blockchain}. INR will be credited to your bank once confirmed.`,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to create order" };
        }
      },
    }),

    get_offramp_order: tool({
      description: "Check the current status of a specific offramp order by order ID.",
      inputSchema: z.object({
        order_id: z.string().describe("The offramp order ID to look up"),
      }),
      execute: async ({ order_id }) => {
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.getOfframpOrder(order_id);
          const o = result.data;
          return {
            order_id: o.order_id,
            status: o.status,
            send_amount: `${o.input_amount} ${o.input_currency}`,
            receive_amount_inr: o.output_amount,
            deposit_address: o.deposit_address,
            payout_utr: o.payout_utr,
            created_at: o.created_at,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch order" };
        }
      },
    }),

    list_offramp_orders: tool({
      description: "List the user's recent offramp (sell crypto for INR) orders with their statuses.",
      inputSchema: z.object({
        limit: z.number().optional().describe("Number of orders to return (default 10)"),
        status: z.string().optional().describe("Filter by status: CREATED, DEPOSIT_PENDING, DEPOSIT_CONFIRMED, PAYOUT_INITIATED, PAYOUT_COMPLETED, FAILED"),
      }),
      execute: async ({ limit, status }) => {
        if (!userId) return { error: "Not authenticated" };
        const provider = getBankingProvider();
        if (!provider) return { error: "Banking not configured" };
        try {
          const result = await provider.listOfframpOrders({ page: 0, limit: limit ?? 10, status, customer_id: userId });
          return {
            orders: (result.data ?? []).map((o: any) => ({
              order_id: o.order_id,
              status: o.status,
              sent: `${o.input_amount} ${o.input_currency}`,
              received_inr: o.output_amount,
              payout_utr: o.payout_utr,
              created_at: o.created_at,
            })),
            total: result.totalCount ?? 0,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to list orders" };
        }
      },
    }),

    // ── Velvet Capital — Portfolio Management ────────────────────────────────

    get_velvet_portfolios: tool({
      description:
        "List all Velvet Capital on-chain portfolios (vaults) owned by the user's wallet on Base. Returns portfolio names, IDs, and all contract addresses needed for further operations.",
      inputSchema: z.object({
        chain: z.enum(["base"]).optional().describe("Chain to query (default: base)"),
      }),
      execute: async ({ chain }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { getPortfoliosByOwner } = await import("@/lib/velvet");
          const portfolios = await getPortfoliosByOwner(walletAddress, chain ?? "base");
          return {
            portfolios: portfolios.map((p) => ({
              portfolio_id: p.portfolioId,
              name: p.name,
              symbol: p.symbol,
              portfolio_address: p.portfolio,
              vault_address: p.vaultAddress,
              rebalancing_address: p.rebalancing,
              asset_management_config: p.assetManagementConfig,
              token_exclusion_manager: p.tokenExclusionManager,
              is_public: p.public,
              chain: p.chainName,
              created_at: p.createdAt,
            })),
            count: portfolios.length,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch portfolios" };
        }
      },
    }),

    get_velvet_portfolio_info: tool({
      description:
        "Get full details of a Velvet portfolio: the user's token balance, ownership percentage, total supply, and each underlying token with its symbol and vault balance. Use this for a comprehensive portfolio view.",
      inputSchema: z.object({
        portfolio_id: z.string().describe("Portfolio ID from get_velvet_portfolios"),
      }),
      execute: async ({ portfolio_id }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { getPortfoliosByOwner, getPortfolioInfo } = await import("@/lib/velvet");
          const portfolios = await getPortfoliosByOwner(walletAddress);
          const portfolio = portfolios.find(
            (p) => p.portfolioId === portfolio_id || p.portfolio.toLowerCase() === portfolio_id.toLowerCase()
          );
          if (!portfolio) return { error: "Portfolio not found" };
          const info = await getPortfolioInfo(portfolio, walletAddress);
          return info;
        } catch (err: any) {
          return { error: err?.message ?? "Failed to fetch portfolio info" };
        }
      },
    }),

    rebalance_velvet_portfolio: tool({
      description:
        "Prepare a rebalance transaction for a Velvet portfolio — swaps one token for another within the vault, changing the token composition. Returns encoded tx data the user must sign. Only call when the user explicitly confirms.",
      inputSchema: z.object({
        rebalancing_address: z.string().describe("Rebalancing contract address from get_velvet_portfolios"),
        sell_token: z.string().describe("Token address to sell out of the vault"),
        buy_token: z.string().describe("Token address to buy into the vault"),
        sell_amount: z.string().describe("Amount to sell in token's smallest unit (e.g. '1000000' for 1 USDC with 6 decimals)"),
        remaining_tokens: z.array(z.string()).describe("Addresses of tokens that will remain in the vault after this trade"),
        slippage_bps: z.string().optional().describe("Slippage tolerance in basis points — default '100' (1%)"),
      }),
      execute: async ({ rebalancing_address, sell_token, buy_token, sell_amount, remaining_tokens, slippage_bps }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { getRebalanceTxData } = await import("@/lib/velvet");
          const txData = await getRebalanceTxData({
            rebalanceAddress: rebalancing_address,
            sellToken: sell_token,
            buyToken: buy_token,
            sellAmount: sell_amount,
            slippage: slippage_bps ?? "100",
            remainingTokens: remaining_tokens,
            owner: walletAddress,
          });
          return {
            pendingRebalance: true,
            rebalancing_address,
            new_tokens: txData.newTokens,
            sell_tokens: txData.sellTokens,
            sell_amounts: txData.sellAmounts,
            handler: txData.handler,
            call_data: txData.callData,
            estimate_gas: txData.estimateGas,
            gas_price: txData.gasPrice,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to prepare rebalance" };
        }
      },
    }),

    update_velvet_weights: tool({
      description:
        "Prepare a weight-update transaction for a Velvet portfolio — adjusts token allocations without adding or removing tokens (sells some of one token to buy more of another already in the vault). Returns encoded tx data. Only call when user explicitly confirms.",
      inputSchema: z.object({
        rebalancing_address: z.string().describe("Rebalancing contract address from get_velvet_portfolios"),
        sell_token: z.string().describe("Token address to reduce (sell)"),
        buy_token: z.string().describe("Token address to increase (buy)"),
        sell_amount: z.string().describe("Amount to sell in token's smallest unit"),
        remaining_tokens: z.array(z.string()).describe("All current vault token addresses (no change to token list)"),
        slippage_bps: z.string().optional().describe("Slippage tolerance in basis points — default '100' (1%)"),
      }),
      execute: async ({ rebalancing_address, sell_token, buy_token, sell_amount, remaining_tokens, slippage_bps }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { getRebalanceTxData } = await import("@/lib/velvet");
          // updateWeights keeps all existing tokens — newTokens = all current tokens (no additions)
          const txData = await getRebalanceTxData({
            rebalanceAddress: rebalancing_address,
            sellToken: sell_token,
            buyToken: buy_token,
            sellAmount: sell_amount,
            slippage: slippage_bps ?? "100",
            remainingTokens: remaining_tokens,
            owner: walletAddress,
          });
          return {
            pendingWeightUpdate: true,
            rebalancing_address,
            sell_tokens: txData.sellTokens,
            sell_amounts: txData.sellAmounts,
            handler: txData.handler,
            call_data: txData.callData,
            estimate_gas: txData.estimateGas,
            gas_price: txData.gasPrice,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to prepare weight update" };
        }
      },
    }),

    deposit_velvet_portfolio: tool({
      description:
        "Prepare a deposit transaction to add ERC-20 tokens into a Velvet portfolio vault. Returns transaction data the user must sign. Only call when the user explicitly confirms.",
      inputSchema: z.object({
        portfolio_address: z.string().describe("Portfolio contract address from get_velvet_portfolios"),
        deposit_token: z.string().describe("ERC-20 token address to deposit"),
        deposit_amount: z.string().describe("Amount in token's smallest unit (e.g. '1000000' for 1 USDC with 6 decimals)"),
      }),
      execute: async ({ portfolio_address, deposit_token, deposit_amount }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { getDepositTxData } = await import("@/lib/velvet");
          const txData = await getDepositTxData({
            portfolio: portfolio_address,
            depositAmount: deposit_amount,
            depositToken: deposit_token,
            user: walletAddress,
          });
          return {
            pendingDeposit: true,
            portfolio_address,
            deposit_token,
            deposit_amount,
            tx: { to: txData.to, data: txData.data, gas_limit: txData.gasLimit, gas_price: txData.gasPrice },
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to prepare deposit" };
        }
      },
    }),

    withdraw_velvet_portfolio: tool({
      description:
        "Prepare a withdrawal transaction to burn portfolio tokens and receive an ERC-20 token from the Velvet vault. Returns transaction data the user must sign. Only call when the user explicitly confirms.",
      inputSchema: z.object({
        portfolio_address: z.string().describe("Portfolio contract address from get_velvet_portfolios"),
        withdraw_token: z.string().describe("ERC-20 token address to receive after withdrawal"),
        withdraw_amount: z.string().describe("Portfolio token amount to burn in smallest unit (18 decimals)"),
      }),
      execute: async ({ portfolio_address, withdraw_token, withdraw_amount }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { getWithdrawTxData } = await import("@/lib/velvet");
          const txData = await getWithdrawTxData({
            portfolio: portfolio_address,
            withdrawAmount: withdraw_amount,
            withdrawToken: withdraw_token,
            user: walletAddress,
          });
          return {
            pendingWithdrawal: true,
            portfolio_address,
            withdraw_token,
            withdraw_amount,
            tx: { to: txData.to, data: txData.data, gas_limit: txData.gasLimit, gas_price: txData.gasPrice },
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to prepare withdrawal" };
        }
      },
    }),

    remove_velvet_token: tool({
      description:
        "Prepare a transaction to remove a token from a Velvet portfolio vault (asset managers only). Can remove fully or partially by percentage. Only call when user explicitly confirms.",
      inputSchema: z.object({
        rebalancing_address: z.string().describe("Rebalancing contract address from get_velvet_portfolios"),
        token_address: z.string().describe("Address of the token to remove from the vault"),
        partial: z.boolean().describe("If true, removes only a percentage of the token; if false, removes entirely"),
        percentage: z.number().min(0).max(100).optional().describe("Percentage to remove (0–100) when partial=true"),
      }),
      execute: async ({ rebalancing_address, token_address, partial, percentage }) => {
        try {
          const { encodeRemovePortfolioToken } = await import("@/lib/velvet");
          const tx = partial && percentage !== undefined
            ? encodeRemovePortfolioToken(rebalancing_address, token_address, true, percentage)
            : encodeRemovePortfolioToken(rebalancing_address, token_address, false);
          return { pendingRemoveToken: true, token_address, partial, percentage, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to prepare token removal" };
        }
      },
    }),

    propose_velvet_fee: tool({
      description:
        "Propose a new fee for a Velvet portfolio (asset managers only). After proposing, the fee takes effect 28 days later via update_velvet_fee. Returns encoded tx data to sign.",
      inputSchema: z.object({
        asset_management_config: z.string().describe("AssetManagementConfig contract address from get_velvet_portfolios"),
        fee_type: z.enum(["management", "performance", "entry_and_exit"]).describe("Which fee to change"),
        new_fee_bps: z.number().min(0).describe("New fee in basis points (e.g. 100 = 1%). For entry_and_exit this is the entry fee."),
        new_exit_fee_bps: z.number().min(0).optional().describe("New exit fee in basis points — only for fee_type 'entry_and_exit'"),
      }),
      execute: async ({ asset_management_config, fee_type, new_fee_bps, new_exit_fee_bps }) => {
        try {
          const { encodeFeeCall } = await import("@/lib/velvet");
          const tx = encodeFeeCall(asset_management_config, fee_type, "propose", new_fee_bps, new_exit_fee_bps);
          return {
            pendingFeeProposal: true,
            fee_type,
            new_fee_bps,
            new_exit_fee_bps,
            note: "Fee will be active after calling update_velvet_fee in 28 days",
            tx,
          };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode fee proposal" };
        }
      },
    }),

    update_velvet_fee: tool({
      description:
        "Finalize a previously proposed Velvet fee update (asset managers only). Can only succeed 28 days after the proposal. Can also cancel a pending proposal. Returns encoded tx data to sign.",
      inputSchema: z.object({
        asset_management_config: z.string().describe("AssetManagementConfig contract address from get_velvet_portfolios"),
        fee_type: z.enum(["management", "performance", "entry_and_exit"]).describe("Which fee to update or cancel"),
        action: z.enum(["update", "cancel"]).describe("'update' finalizes the fee after 28 days; 'cancel' deletes the pending proposal"),
      }),
      execute: async ({ asset_management_config, fee_type, action }) => {
        try {
          const { encodeFeeCall } = await import("@/lib/velvet");
          const tx = encodeFeeCall(asset_management_config, fee_type, action);
          return { pendingFeeAction: true, fee_type, action, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode fee action" };
        }
      },
    }),

    manage_velvet_whitelist: tool({
      description:
        "Add or remove users from a Velvet portfolio's depositor whitelist (asset managers only). Only whitelisted users can deposit into private portfolios. Returns encoded tx data to sign.",
      inputSchema: z.object({
        asset_management_config: z.string().describe("AssetManagementConfig contract address from get_velvet_portfolios"),
        action: z.enum(["add", "remove"]).describe("'add' grants deposit access; 'remove' revokes it"),
        users: z.array(z.string()).describe("Wallet addresses to add or remove from the whitelist"),
      }),
      execute: async ({ asset_management_config, action, users }) => {
        try {
          const { encodeWhitelistCall } = await import("@/lib/velvet");
          const tx = encodeWhitelistCall(asset_management_config, action, users);
          return { pendingWhitelistUpdate: true, action, users, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode whitelist update" };
        }
      },
    }),

    update_velvet_settings: tool({
      description:
        "Update Velvet portfolio settings (asset managers only): transferability, convert to public fund, update treasury address, set minimum holding amount, set initial portfolio amount, or enable Uniswap V3 management. Returns encoded tx data to sign.",
      inputSchema: z.object({
        asset_management_config: z.string().describe("AssetManagementConfig contract address from get_velvet_portfolios"),
        setting: z.enum(["transferability", "convert_to_public", "treasury", "min_holding_amount", "initial_amount", "enable_uniswap_v3"]).describe("Which setting to update"),
        transferable: z.boolean().optional().describe("For 'transferability': whether portfolio tokens can be transferred"),
        public_transfer: z.boolean().optional().describe("For 'transferability': whether transfers to non-whitelisted addresses are allowed"),
        new_treasury: z.string().optional().describe("For 'treasury': new address where management fees accumulate"),
        amount_wei: z.string().optional().describe("For 'min_holding_amount' or 'initial_amount': amount in wei (18 decimals)"),
      }),
      execute: async ({ asset_management_config, setting, transferable, public_transfer, new_treasury, amount_wei }) => {
        try {
          const lib = await import("@/lib/velvet");
          let tx: { to: string; data: string };
          if (setting === "transferability") {
            if (transferable === undefined) return { error: "transferable is required for transferability setting" };
            tx = lib.encodeTransferabilityCall(asset_management_config, transferable, public_transfer ?? false);
          } else if (setting === "convert_to_public") {
            tx = lib.encodeConvertToPublicCall(asset_management_config);
          } else if (setting === "treasury") {
            if (!new_treasury) return { error: "new_treasury address is required for treasury setting" };
            tx = lib.encodeTreasuryCall(asset_management_config, new_treasury);
          } else if (setting === "min_holding_amount") {
            if (!amount_wei) return { error: "amount_wei is required for min_holding_amount" };
            tx = lib.encodeMinHoldingAmountCall(asset_management_config, BigInt(amount_wei));
          } else if (setting === "initial_amount") {
            if (!amount_wei) return { error: "amount_wei is required for initial_amount" };
            tx = lib.encodeInitialPortfolioAmountCall(asset_management_config, BigInt(amount_wei));
          } else {
            tx = lib.encodeEnableUniswapV3ManagerCall(asset_management_config);
          }
          return { pendingSettingsUpdate: true, setting, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode settings update" };
        }
      },
    }),

    manage_velvet_collateral: tool({
      description:
        "Enable or disable specific tokens as collateral in a Velvet portfolio vault (asset managers only). Collateral tokens can be used for borrowing against the vault's holdings. Returns encoded tx data to sign.",
      inputSchema: z.object({
        rebalancing_address: z.string().describe("Rebalancing contract address from get_velvet_portfolios"),
        action: z.enum(["enable", "disable"]).describe("Whether to enable or disable the tokens as collateral"),
        tokens: z.array(z.string()).describe("Token addresses to enable or disable as collateral"),
        controller: z.string().describe("Lending protocol controller address"),
      }),
      execute: async ({ rebalancing_address, action, tokens, controller }) => {
        try {
          const { encodeCollateralTokensCall } = await import("@/lib/velvet");
          const tx = encodeCollateralTokensCall(rebalancing_address, action, tokens, controller);
          return { pendingCollateralUpdate: true, action, tokens, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode collateral update" };
        }
      },
    }),

    velvet_borrow: tool({
      description:
        "Borrow a token from a lending pool against collateral held in a Velvet portfolio vault (asset managers only). Enable collateral tokens first via manage_velvet_collateral. Returns encoded tx data to sign.",
      inputSchema: z.object({
        rebalancing_address: z.string().describe("Rebalancing contract address from get_velvet_portfolios"),
        pool: z.string().describe("Lending pool contract address"),
        tokens: z.array(z.string()).describe("Collateral token addresses pledged for the borrow"),
        token_to_borrow: z.string().describe("Address of the token to borrow"),
        controller: z.string().describe("Lending protocol controller address"),
        amount_wei: z.string().describe("Amount to borrow in the token's smallest unit"),
      }),
      execute: async ({ rebalancing_address, pool, tokens, token_to_borrow, controller, amount_wei }) => {
        try {
          const { encodeBorrowCall } = await import("@/lib/velvet");
          const tx = encodeBorrowCall(rebalancing_address, pool, tokens, token_to_borrow, controller, BigInt(amount_wei));
          return { pendingBorrow: true, token_to_borrow, amount_wei, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode borrow" };
        }
      },
    }),

    // ── Flash Trade — Read-only queries ──────────────────────────────────────

    flash_get_tokens: tool({
      description: "List all tokens available on Flash Trade for swapping and liquidity operations (e.g. SOL, USDC, BTC, ETH, JitoSOL). Call this when the user asks what they can swap or deposit.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/tokens`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    // ── Flash Trade — Quotes (read-only) ─────────────────────────────────────

    flash_get_open_quote: tool({
      description: "Get a price quote for opening a Flash Trade position — returns estimated entry price, fee, and size. Call this before flash_open_position so the user can see the cost.",
      inputSchema: z.object({
        market: z.string().describe("Market symbol, e.g. 'SOL', 'BTC'"),
        side: z.enum(["long", "short"]),
        collateralUsd: z.number().positive().describe("Collateral in USD"),
        leverage: z.number().min(1).max(100),
      }),
      execute: async ({ market, side, collateralUsd, leverage }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const { getMarketsInfo } = await import("@/lib/flash");
          const markets = getMarketsInfo();
          const m = markets.find(mk => mk.symbol.toUpperCase() === market.toUpperCase() && mk.side === side);
          if (!m) return { error: `Market ${market} ${side} not found` };
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/quote?marketId=${m.marketId}&collateral=${collateralUsd}&leverage=${leverage}`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_get_close_quote: tool({
      description: "Get a price quote for closing a Flash Trade position — returns estimated exit price, fees, PnL, and how much the user will receive. Call before flash_close_position to show the user what they'll get.",
      inputSchema: z.object({
        marketId: z.number().int().describe("Market ID from flash_get_positions"),
        sizeDeltaUsd: z.number().positive().optional().describe("USD size to close — omit for full close quote"),
      }),
      execute: async ({ marketId, sizeDeltaUsd }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const params = new URLSearchParams({ wallet: solanaAddress, marketId: String(marketId) });
          if (sizeDeltaUsd != null) params.set("sizeDeltaUsd", String(sizeDeltaUsd));
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/close-quote?${params}`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_get_collateral_quote: tool({
      description: "Get a quote for adding or removing collateral on an open Flash Trade position — returns new leverage and new liquidation price. Call before flash_add_collateral or flash_remove_collateral.",
      inputSchema: z.object({
        marketId: z.number().int().describe("Market ID from flash_get_positions"),
        direction: z.enum(["add", "remove"]).describe("Whether the user is adding or removing collateral"),
        collateralUsd: z.number().positive().describe("Amount of collateral in USD"),
      }),
      execute: async ({ marketId, direction, collateralUsd }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const params = new URLSearchParams({ wallet: solanaAddress, marketId: String(marketId), direction, collateralUsd: String(collateralUsd) });
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/collateral-quote?${params}`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_get_swap_quote: tool({
      description: "Get a price quote for swapping tokens on Flash — returns estimated output amount and fee. Call before flash_swap to show the user what they'll receive.",
      inputSchema: z.object({
        inSymbol: z.string().describe("Token to sell, e.g. 'SOL'"),
        outSymbol: z.string().describe("Token to buy, e.g. 'USDC'"),
        amountIn: z.number().positive().describe("Amount of inSymbol to sell"),
      }),
      execute: async ({ inSymbol, outSymbol, amountIn }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/swap-quote?inSymbol=${inSymbol}&outSymbol=${outSymbol}&amountIn=${amountIn}`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_get_liquidity_quote: tool({
      description: "Get a quote for Flash liquidity operations — how much FLP/sFLP you'll receive when adding, or how much token you'll get when removing. Call before flash_add_liquidity, flash_remove_liquidity, flash_add_compounding, or flash_remove_compounding.",
      inputSchema: z.object({
        action: z.enum(["add", "remove", "sflp-add", "sflp-remove"]).describe("'add'=add FLP, 'remove'=remove FLP, 'sflp-add'=add sFLP, 'sflp-remove'=remove sFLP"),
        symbol: z.string().describe("Token symbol — for add: the token you deposit (e.g. 'USDC'); for remove: the token you want back (e.g. 'USDC')"),
        amount: z.number().positive().describe("For add: amount of token to deposit; for remove: amount of FLP/sFLP tokens to burn"),
      }),
      execute: async ({ action, symbol, amount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/liquidity-quote?action=${action}&symbol=${symbol}&amount=${amount}`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    // ── Flash Trade — Perpetuals ──────────────────────────────────────────────

    flash_get_markets: tool({
      description: "List all Flash Trade perpetual markets with current prices, funding rates and available leverage. Call this before opening a position or when the user asks about tradeable assets.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/markets`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_get_positions: tool({
      description: "Get the user's open Flash Trade positions and pending orders on Solana. Returns marketId, side, size, collateral, entry price, and current PnL for each position.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/positions?ownerAddress=${solanaAddress}`);
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_get_position_stats: tool({
      description: "Get real-time PnL and liquidation price for a specific open Flash Trade position. Call after flash_get_positions to get the marketId.",
      inputSchema: z.object({
        marketId: z.number().int().describe("Market ID from flash_get_positions"),
      }),
      execute: async ({ marketId }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/position-stats?wallet=${solanaAddress}&marketId=${marketId}`
          );
          if (!r.ok) return { error: await r.text() };
          return await r.json();
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_deposit_to_vault: tool({
      description: "Deposit tokens into the Flash Trade vault to use as collateral for trading. The vault holds funds ready for positions.",
      inputSchema: z.object({
        tokenSymbol: z.string().describe("Token to deposit, e.g. 'USDC', 'SOL'"),
        amount: z.number().positive().describe("Amount to deposit"),
      }),
      execute: async ({ tokenSymbol, amount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/deposit-direct`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, tokenSymbol, amount }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "deposit_to_vault", args: { tokenSymbol, amount }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_withdraw_from_vault: tool({
      description: "Withdraw tokens from the Flash Trade vault back to the user's wallet.",
      inputSchema: z.object({
        tokenSymbol: z.string().describe("Token to withdraw, e.g. 'USDC'"),
        amount: z.number().positive().describe("Amount to withdraw"),
      }),
      execute: async ({ tokenSymbol, amount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/withdrawal`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, tokenSymbol, amount }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "withdraw_from_vault", args: { tokenSymbol, amount }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_open_position: tool({
      description: "Prepare a leveraged long or short position on Flash Trade. Returns a pending Solana transaction for the user to sign — NEVER call without explicit confirmation of market, side, collateral and leverage. To add TP/SL, call flash_place_trigger_order after the position is confirmed open.",
      inputSchema: z.object({
        market: z.string().describe("Market symbol, e.g. 'SOL', 'BTC', 'ETH'"),
        side: z.enum(["long", "short"]).describe("Direction of the trade"),
        collateralSymbol: z.string().default("USDC").describe("Token used as collateral, usually 'USDC'"),
        collateralUsd: z.number().positive().describe("Collateral amount in USD"),
        leverage: z.number().min(1).max(100).describe("Leverage multiplier (1–100)"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-open`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "open_position", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_close_position: tool({
      description: "Close or partially close an open Flash Trade position. Use flash_get_positions first to get the marketId.",
      inputSchema: z.object({
        marketId: z.number().int().describe("Market ID from flash_get_positions"),
        closePercent: z.number().min(1).max(100).default(100).describe("Percentage to close (100 = full close)"),
        collateralSymbol: z.string().default("USDC").describe("Collateral token symbol"),
      }),
      execute: async ({ marketId, closePercent, collateralSymbol }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const endpoint = closePercent < 100 ? "/api/flash/build-partial-close" : "/api/flash/build-close";
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}${endpoint}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, marketId, closePercent, collateralSymbol }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "close_position", args: { marketId, closePercent }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_place_limit_order: tool({
      description: "Place a limit entry order on Flash Trade at a specific price.",
      inputSchema: z.object({
        market: z.string().describe("Market symbol, e.g. 'SOL'"),
        side: z.enum(["long", "short"]),
        collateralSymbol: z.string().default("USDC"),
        collateralUsd: z.number().positive(),
        leverage: z.number().min(1).max(100),
        limitPrice: z.number().positive().describe("Entry price trigger in USD"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-limit-order`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "limit_order", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_place_trigger_order: tool({
      description: "Set a stop-loss or take-profit trigger on an open Flash Trade position.",
      inputSchema: z.object({
        marketId: z.number().int(),
        isStopLoss: z.boolean().describe("true = stop-loss, false = take-profit"),
        triggerPrice: z.number().positive().describe("Trigger price in USD"),
        deltaSizeUsd: z.number().positive().describe("Position size reduction in USD when triggered"),
        collateralSymbol: z.string().default("USDC"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-trigger-order`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "trigger_order", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_cancel_order: tool({
      description: "Cancel a pending Flash Trade limit or trigger order. For trigger orders, isStopLoss must match the order being cancelled — get it from flash_get_positions.",
      inputSchema: z.object({
        marketId: z.number().int(),
        orderId: z.number().int(),
        orderType: z.enum(["limit", "trigger"]),
        isStopLoss: z.boolean().optional().describe("Required when orderType='trigger': true for stop-loss, false for take-profit"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/cancel-order`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "cancel_order", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_add_collateral: tool({
      description: "Add collateral to an open Flash Trade position to reduce liquidation risk.",
      inputSchema: z.object({
        marketId: z.number().int(),
        collateralSymbol: z.string().default("USDC"),
        amountUsd: z.number().positive().describe("Amount of collateral to add in USD"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-add-collateral`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "add_collateral", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_remove_collateral: tool({
      description: "Remove collateral from an open Flash Trade position.",
      inputSchema: z.object({
        marketId: z.number().int(),
        collateralSymbol: z.string().default("USDC"),
        amountUsd: z.number().positive().describe("Amount of collateral to remove in USD"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-remove-collateral`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "remove_collateral", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    // ── Flash Swap & Earn ─────────────────────────────────────────────────────

    flash_swap: tool({
      description: "Swap one token for another using Flash Trade's AMM on Solana. Call this when the user says 'swap X SOL for USDC' or similar.",
      inputSchema: z.object({
        inSymbol: z.string().describe("Token to sell, e.g. 'SOL'"),
        outSymbol: z.string().describe("Token to buy, e.g. 'USDC'"),
        amountIn: z.number().positive().describe("Amount of inSymbol to sell"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-swap`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "swap", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_add_liquidity: tool({
      description: "Add liquidity to Flash's FLP pool to earn trading fees. The user deposits a token and receives FLP tokens.",
      inputSchema: z.object({
        inSymbol: z.string().describe("Token to deposit, e.g. 'USDC', 'SOL'"),
        amountIn: z.number().positive(),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-add-liquidity`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "add_liquidity", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_remove_liquidity: tool({
      description: "Remove FLP liquidity from Flash pool. The user burns FLP tokens and receives a chosen token back.",
      inputSchema: z.object({
        outSymbol: z.string().describe("Token to receive back, e.g. 'USDC'"),
        lpAmountIn: z.number().positive().describe("Amount of FLP tokens to burn"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-remove-liquidity`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "remove_liquidity", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_add_compounding: tool({
      description: "Add sFLP (auto-compounding) liquidity to Flash pool. Rewards are automatically reinvested.",
      inputSchema: z.object({
        inSymbol: z.string().describe("Token to deposit"),
        amountIn: z.number().positive(),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-add-compounding`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "add_compounding", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_remove_compounding: tool({
      description: "Remove sFLP (auto-compounding) liquidity from Flash pool.",
      inputSchema: z.object({
        outSymbol: z.string().describe("Token to receive back"),
        sflpAmountIn: z.number().positive().describe("Amount of sFLP tokens to burn"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-remove-compounding`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "remove_compounding", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_stake_flash: tool({
      description: "Stake FLASH tokens to earn protocol rewards.",
      inputSchema: z.object({ amount: z.number().positive().describe("Amount of FLASH tokens to stake") }),
      execute: async ({ amount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-stake`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, amount }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "stake_flash", args: { amount }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_unstake_flash: tool({
      description: "Request to unstake FLASH tokens (starts a cooldown period on-chain).",
      inputSchema: z.object({ amount: z.number().positive().describe("Amount of FLASH tokens to unstake") }),
      execute: async ({ amount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-unstake`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, amount }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "unstake_flash", args: { amount }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_cancel_unstake: tool({
      description: "Cancel a pending FLASH unstake request by its request ID.",
      inputSchema: z.object({ withdrawRequestId: z.number().int().min(0) }),
      execute: async ({ withdrawRequestId }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/cancel-unstake`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, withdrawRequestId }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "cancel_unstake", args: { withdrawRequestId }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_withdraw_flash: tool({
      description: "Withdraw FLASH tokens after the unstake cooldown has completed. Requires the withdraw request ID.",
      inputSchema: z.object({ withdrawRequestId: z.number().int().min(0) }),
      execute: async ({ withdrawRequestId }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/withdraw-flash`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, withdrawRequestId }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "withdraw_flash", args: { withdrawRequestId }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_collect_stake_reward: tool({
      description: "Collect accumulated FLASH token staking rewards.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/collect-stake-reward`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "collect_stake_reward", args: {}, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_collect_flp_reward: tool({
      description: "Collect FLP liquidity staking rewards (paid in USDC).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/collect-flp-reward`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "collect_flp_reward", args: {}, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_collect_rebate: tool({
      description: "Collect accumulated Flash Trade trading fee rebates (paid in USDC).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/collect-rebate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "collect_rebate", args: {}, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_cancel_all_triggers: tool({
      description: "Cancel ALL stop-loss and take-profit trigger orders for a specific market at once.",
      inputSchema: z.object({
        marketId: z.number().int().describe("Market ID from flash_get_positions"),
      }),
      execute: async ({ marketId }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/cancel-all-triggers`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, marketId }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "cancel_all_triggers", args: { marketId }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_migrate_to_sflp: tool({
      description: "Convert staked FLP tokens into sFLP (auto-compounding). Rewards then compound automatically instead of needing manual claims.",
      inputSchema: z.object({
        flpAmount: z.number().positive().describe("Amount of FLP tokens to convert to sFLP"),
      }),
      execute: async ({ flpAmount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/migrate-stake`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, flpAmount }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "migrate_to_sflp", args: { flpAmount }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_migrate_to_flp: tool({
      description: "Convert sFLP (auto-compounding) back into staked FLP. Rewards must then be claimed manually.",
      inputSchema: z.object({
        sflpAmount: z.number().positive().describe("Amount of sFLP tokens to convert back to staked FLP"),
      }),
      execute: async ({ sflpAmount }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/migrate-flp`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, sflpAmount }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "migrate_to_flp", args: { sflpAmount }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_collect_revenue: tool({
      description: "Collect referral program revenue share from Flash Trade (for users who have referred active traders).",
      inputSchema: z.object({
        revenueTokenSymbol: z.string().default("USDC").describe("Token to receive revenue in, usually USDC"),
      }),
      execute: async ({ revenueTokenSymbol }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/collect-revenue`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, revenueTokenSymbol }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "collect_revenue", args: { revenueTokenSymbol }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_increase_position: tool({
      description: "Increase the size of an existing open Flash Trade position by adding more collateral and increasing leverage. Use when the user says 'add to my position', 'increase my long', or 'scale into my trade'. Call flash_get_positions first to get the marketId.",
      inputSchema: z.object({
        marketId: z.number().int().describe("Market ID from flash_get_positions"),
        addCollateralUsd: z.number().positive().describe("Additional collateral to add in USD"),
        sizeDeltaUsd: z.number().positive().describe("Position size increase in USD notional"),
        slippageBps: z.number().int().min(1).max(500).default(100).describe("Slippage tolerance in basis points (100 = 1%)"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/build-increase-position`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "increase_position", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_edit_limit_order: tool({
      description: "Edit an existing Flash Trade limit order — change the entry price, size, take-profit, or stop-loss. Use flash_get_positions first to get the marketId and orderId.",
      inputSchema: z.object({
        marketId: z.number().int(),
        orderId: z.number().int(),
        newLimitPrice: z.number().positive().describe("New entry limit price in USD"),
        newSizeUsd: z.number().positive().describe("New position size in USD notional"),
        newTakeProfitPrice: z.number().positive().optional().describe("New take-profit price in USD"),
        newStopLossPrice: z.number().positive().optional().describe("New stop-loss price in USD"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/edit-order`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, orderType: "limit", ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "edit_limit_order", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_edit_trigger_order: tool({
      description: "Edit an existing Flash Trade stop-loss or take-profit trigger order — change the trigger price or size. Use flash_get_positions first to get the marketId and orderId.",
      inputSchema: z.object({
        marketId: z.number().int(),
        orderId: z.number().int(),
        isStopLoss: z.boolean().describe("true = stop-loss, false = take-profit"),
        newTriggerPrice: z.number().positive().describe("New trigger price in USD"),
        newDeltaSizeUsd: z.number().positive().describe("New size reduction in USD when triggered"),
      }),
      execute: async (args) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/edit-order`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, orderType: "trigger", ...args }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "edit_trigger_order", args, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    flash_create_session: tool({
      description: "Create a Flash Trade trading session so the user can trade without signing every transaction. The session lasts up to 24 hours. After approval, Bottie can execute trades automatically on their behalf. Always confirm before creating.",
      inputSchema: z.object({
        durationHours: z.number().min(0.5).max(24).default(8).describe("Session duration in hours (max 24)"),
      }),
      // The session keypair must be generated client-side (FlashSessionApprovalCard) so the private key
      // never touches the server. We just return the pending marker here; the card handles the API call.
      execute: async ({ durationHours }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        return { pendingFlashSession: true, action: "create_session", args: { durationHours }, solanaAddress };
      },
    }),

    flash_revoke_session: tool({
      description: "Revoke the active Flash Trade trading session, stopping automatic trade execution immediately.",
      inputSchema: z.object({}),
      // The session keypair pubkey lives in the browser's localStorage — the server cannot access it.
      // Return a pendingFlashRevoke marker; FlashRevokeSessionCard reads localStorage and handles the full flow client-side.
      execute: async () => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        return { pendingFlashRevoke: true, solanaAddress };
      },
    }),

    flash_create_referral: tool({
      description: "Link a referrer wallet address for the user on Flash Trade to start earning rebates.",
      inputSchema: z.object({ referrerAddress: z.string().describe("The referrer's Solana wallet address") }),
      execute: async ({ referrerAddress }) => {
        if (!solanaAddress) return { error: "Solana wallet not connected" };
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/flash/create-referral`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerAddress: solanaAddress, referrerAddress }),
          });
          if (!r.ok) return { error: await r.text() };
          const { transaction } = await r.json();
          return { pendingFlashTx: true, action: "create_referral", args: { referrerAddress }, transaction, solanaAddress };
        } catch (err: any) { return { error: err?.message ?? "Failed" }; }
      },
    }),

    claim_velvet_removed_tokens: tool({
      description:
        "Claim the user's proportionate share of tokens that were removed from a Velvet portfolio vault. Use when the user mentions tokens were excluded or removed from a vault they hold.",
      inputSchema: z.object({
        token_exclusion_manager: z.string().describe("TokenExclusionManager contract address from get_velvet_portfolios"),
        start_id: z.number().int().min(0).describe("Starting exclusion event ID to claim from"),
        end_id: z.number().int().min(0).describe("Ending exclusion event ID to claim to (inclusive)"),
      }),
      execute: async ({ token_exclusion_manager, start_id, end_id }) => {
        if (!walletAddress) return { error: "Wallet not connected" };
        try {
          const { encodeClaimRemovedTokens } = await import("@/lib/velvet");
          const tx = encodeClaimRemovedTokens(token_exclusion_manager, walletAddress, start_id, end_id);
          return { pendingClaim: true, user: walletAddress, start_id, end_id, tx };
        } catch (err: any) {
          return { error: err?.message ?? "Failed to encode claim" };
        }
      },
    }),

  };
}
