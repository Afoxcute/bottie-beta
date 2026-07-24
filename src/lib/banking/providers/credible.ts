import crypto, { randomUUID } from "crypto";
import type {
  BankingProvider,
  ProviderBalance,
  BankingTransaction,
  CollectionParams,
  CollectionResult,
  PayoutParams,
  PayoutResult,
  TransactionStatus,
} from "../types";

const BASE_URL = "https://api.credible.finance/collections/api";

function buildSignature(
  params: Record<string, string | number>,
  nonce: number,
  recvWindow: number,
  secret: string,
): string {
  // Sort params alphabetically, append nonce and recv_window
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const payload = `${sorted}&nonce=${nonce}&recv_window=${recvWindow}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function authHeaders(
  queryParams: Record<string, string | number> = {},
  recvWindow = 5000,
): Record<string, string> {
  const nonce = Date.now();
  const secret = process.env.CREDIBLE_FINANCE_API_SECRET ?? "";
  const signature = buildSignature(queryParams, nonce, recvWindow, secret);
  return {
    "Content-Type": "application/json",
    "X-API-KEY": process.env.CREDIBLE_FINANCE_API_KEY ?? "",
    "X-NONCE": String(nonce),
    "X-RECV-WINDOW": String(recvWindow),
    "X-SIGNATURE": signature,
  };
}

function postHeaders(
  bodyParams: Record<string, unknown> = {},
  recvWindow = 5000,
): Record<string, string> {
  // For POST, sign over all body fields
  const signableParams: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(bodyParams)) {
    if (typeof v === "string" || typeof v === "number") {
      signableParams[k] = v;
    }
  }
  const nonce = Date.now();
  const secret = process.env.CREDIBLE_FINANCE_API_SECRET ?? "";
  const signature = buildSignature(signableParams, nonce, recvWindow, secret);
  return {
    "Content-Type": "application/json",
    "X-API-KEY": process.env.CREDIBLE_FINANCE_API_KEY ?? "",
    "X-NONCE": String(nonce),
    "X-RECV-WINDOW": String(recvWindow),
    "X-SIGNATURE": signature,
    "Idempotency-Key": randomUUID(),
  };
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number>; body?: Record<string, unknown> } = {},
): Promise<T> {
  const { query = {}, body } = opts;

  let url = `${BASE_URL}${path}`;
  if (Object.keys(query).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    ).toString();
    url = `${url}?${qs}`;
  }

  const headers =
    method === "GET" ? authHeaders(query) : postHeaders(body ?? {});

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Credible ${method} ${path} → ${res.status}: ${text}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Credible: non-JSON response: ${text.slice(0, 200)}`);
  }
}

// ── Raw API shapes ─────────────────────────────────────────────────────────────

interface RawBalance {
  balance: number;
  currency: string;
  total_credit_limit: number;
  consumed_credit: number;
  available_credit: number;
}

interface RawCollection {
  collection_id: string;
  merchant_collection_id: string;
  customer_id?: string;
  merchant_customer_id?: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description?: string;
  created_at?: string;
  redirect_url?: string;
  upi_intent?: string;
  qr_code?: string;
}

interface RawCollectionList {
  data: RawCollection[];
  total_count: number;
}

interface RawPayout {
  payout_id: string;
  merchant_payout_id: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description?: string;
  created_at?: string;
}

interface RawLedgerEntry {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  created_at?: string;
  description?: string;
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapCollection(r: RawCollection): BankingTransaction {
  return {
    id: r.collection_id,
    merchantReferenceId: r.merchant_collection_id,
    type: "collection",
    amount: r.amount,
    currency: r.currency ?? "INR",
    status: r.status,
    description: r.description,
    createdAt: r.created_at,
    upiIntent: r.upi_intent,
    qrCode: r.qr_code,
    redirectUrl: r.redirect_url,
  };
}

function mapPayout(r: RawPayout): BankingTransaction {
  return {
    id: r.payout_id,
    merchantReferenceId: r.merchant_payout_id,
    type: "payout",
    amount: r.amount,
    currency: r.currency ?? "INR",
    status: r.status,
    description: r.description,
    createdAt: r.created_at,
  };
}

// ── Provider ───────────────────────────────────────────────────────────────────

class CredibleFinanceProvider implements BankingProvider {
  readonly id = "credible";
  readonly name = "Credible Finance";
  readonly description = "UPI collections & bank payouts · INR";
  readonly currency = "INR";
  readonly currencySymbol = "₹";
  readonly flag = "🇮🇳";
  readonly minCollectionAmount = 300;

  isConfigured(): boolean {
    return !!(
      process.env.CREDIBLE_FINANCE_API_KEY && process.env.CREDIBLE_FINANCE_API_SECRET
    );
  }

  async getBalance(currency = "inr"): Promise<ProviderBalance> {
    const data = await request<RawBalance>("GET", "/getMerchantBalance", {
      query: { currency },
    });
    return {
      amount: data.balance,
      currency: data.currency?.toUpperCase() ?? "INR",
      currencySymbol: "₹",
    };
  }

  async getTransactions(): Promise<BankingTransaction[]> {
    const result = await request<RawCollectionList>("GET", "/getCollections");
    return result.data.map(mapCollection);
  }

  async getTransaction(id: string): Promise<BankingTransaction> {
    const data = await request<RawCollection>("GET", "/getCollectionInfo", {
      query: { collection_id: id },
    });
    return mapCollection(data);
  }

  async initiateCollection(userId: string, params: CollectionParams): Promise<CollectionResult> {
    const merchant_collection_id = `${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const body: Record<string, unknown> = {
      amount: params.amount,
      currency: "INR",
      merchant_collection_id,
      customer_id: params.customerRef ?? userId,
    };
    if (params.description) body.description = params.description;

    const data = await request<RawCollection>("POST", "/initiateCollection", { body });
    return mapCollection(data) as CollectionResult;
  }

  async initiatePayout(userId: string, params: PayoutParams): Promise<PayoutResult> {
    const merchant_payout_id = `payout-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const body: Record<string, unknown> = {
      amount: params.amount,
      currency: "INR",
      merchant_payout_id,
      account_holder_name: params.beneficiaryName,
      account_number: params.beneficiaryAccountNumber,
      ifsc: params.beneficiaryIfsc,
      wallet: "collection",
    };
    if (params.description) body.description = params.description;

    const data = await request<RawPayout>("POST", "/initiatePayout", { body });
    return mapPayout(data) as PayoutResult;
  }

  /** KYC payout — required for crypto_offramp / nre / trade_finance purposes */
  async initiatePayoutV2(
    userId: string,
    params: PayoutParams & {
      purpose: "crypto_offramp" | "nre" | "trade_finance";
      receiverCustomerId?: string;
      senderCustomerId?: string;
    },
  ): Promise<PayoutResult> {
    const merchant_payout_id = `payoutv2-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const body: Record<string, unknown> = {
      amount: params.amount,
      currency: "INR",
      merchant_payout_id,
      account_holder_name: params.beneficiaryName,
      account_number: params.beneficiaryAccountNumber,
      ifsc: params.beneficiaryIfsc,
      purpose: params.purpose,
      wallet: "collection",
    };
    if (params.receiverCustomerId) body.receiver_customer_id = params.receiverCustomerId;
    if (params.senderCustomerId) body.sender_customer_id = params.senderCustomerId;
    if (params.description) body.description = params.description;

    const data = await request<RawPayout>("POST", "/initiatePayoutV2", { body });
    return mapPayout(data) as PayoutResult;
  }

  /** Move funds from collection wallet to payout wallet */
  async transferToPayout(currency: string, amount: number): Promise<{
    afterCollectionBalance: number;
    afterPayoutBalance: number;
    currency: string;
  }> {
    const data = await request<{
      after_collection_balance: number;
      after_payout_balance: number;
      currency: string;
    }>("POST", "/transferToPayout", {
      body: { currency, amount },
    });
    return {
      afterCollectionBalance: data.after_collection_balance,
      afterPayoutBalance: data.after_payout_balance,
      currency: data.currency,
    };
  }

  /** Fetch paginated wallet ledger entries */
  async getWalletLedger(
    page = 1,
    limit = 20,
  ): Promise<{ data: RawLedgerEntry[]; totalCount: number }> {
    const result = await request<{ data: RawLedgerEntry[]; total_count: number }>(
      "GET",
      "/getWalletLedger",
      { query: { page, limit } },
    );
    return { data: result.data, totalCount: result.total_count };
  }

  verifyWebhook(body: Record<string, unknown>): boolean {
    const { metadata, signature } = body as { metadata?: object; signature?: string };
    if (!metadata || !signature) return false;
    const secret = process.env.CREDIBLE_FINANCE_API_SECRET ?? "";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(metadata))
      .digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    } catch {
      return false;
    }
  }
}

export const credibleProvider = new CredibleFinanceProvider();
