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

// ── Base URLs ──────────────────────────────────────────────────────────────────

const COLLECTIONS_BASE = "https://api.credible.finance/collections/api";
const ONRAMP_BASE      = "https://api.credible.finance/onramp";
const OFFRAMP_BASE     = "https://api.credible.finance/offramp";
const REMITTANCE_BASE  = "https://api.credible.finance/remittance/api";

// ── Auth helpers ───────────────────────────────────────────────────────────────

function buildSignature(
  params: Record<string, string | number>,
  nonce: number,
  recvWindow: number,
  secret: string,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const payload = `${sorted}&nonce=${nonce}&recv_window=${recvWindow}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function getAuthHeaders(
  signingParams: Record<string, string | number> = {},
  recvWindow = 5000,
  includeIdempotency = false,
): Record<string, string> {
  const nonce = Date.now();
  const secret = process.env.CREDIBLE_FINANCE_API_SECRET ?? "";
  const signature = buildSignature(signingParams, nonce, recvWindow, secret);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-KEY": process.env.CREDIBLE_FINANCE_API_KEY ?? "",
    "X-NONCE": String(nonce),
    "X-RECV-WINDOW": String(recvWindow),
    "X-SIGNATURE": signature,
  };
  if (includeIdempotency) headers["Idempotency-Key"] = randomUUID();
  return headers;
}

/** JSON.stringify with keys sorted alphabetically (required for webhook verification) */
function sortedJsonStringify(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as object).sort()) {
    sorted[key] = (obj as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}

// ── Generic fetch wrapper ──────────────────────────────────────────────────────

async function apiRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  opts: { query?: Record<string, string | number>; body?: Record<string, unknown> } = {},
): Promise<T> {
  const { query = {}, body } = opts;

  let url = `${baseUrl}${path}`;
  if (Object.keys(query).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    ).toString();
    url = `${url}?${qs}`;
  }

  const signingParams: Record<string, string | number> = {};
  const source = method === "GET" ? query : (body ?? {});
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "string" || typeof v === "number") signingParams[k] = v;
  }

  const headers = getAuthHeaders(signingParams, 5000, method !== "GET");

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

const col = <T>(m: string, p: string, o?: Parameters<typeof apiRequest>[3]) => apiRequest<T>(COLLECTIONS_BASE, m, p, o);
const onr = <T>(m: string, p: string, o?: Parameters<typeof apiRequest>[3]) => apiRequest<T>(ONRAMP_BASE, m, p, o);
const off = <T>(m: string, p: string, o?: Parameters<typeof apiRequest>[3]) => apiRequest<T>(OFFRAMP_BASE, m, p, o);
const rem = <T>(m: string, p: string, o?: Parameters<typeof apiRequest>[3]) => apiRequest<T>(REMITTANCE_BASE, m, p, o);

// ── Raw shapes — Collections ───────────────────────────────────────────────────

interface RawCollBalance { balance: number; currency: string; total_credit_limit: number; consumed_credit: number; available_credit: number; }
interface RawCollection {
  collection_id: string; merchant_collection_id: string; customer_id?: string; merchant_customer_id?: string;
  amount: number; currency: string; status: TransactionStatus; description?: string; created_at?: string;
  redirect_url?: string; upi_intent?: string; qr_code?: string;
}
interface RawCollectionList { data: RawCollection[]; total_count: number; }
interface RawCollPayout { payout_id: string; merchant_payout_id: string; amount: number; currency: string; status: TransactionStatus; description?: string; created_at?: string; }
export interface RawLedgerEntry { id: string; type: string; amount: number; currency: string; status: string; created_at?: string; description?: string; }

// ── Raw shapes — Onramp ────────────────────────────────────────────────────────

export interface OnrampPair { pair_id: string; input_currency: string; output_currency: string; blockchain: string; min_output_amount: number; max_output_amount: number; fee_bps: number; network_fees: number; processing_time_min: number; processing_time_max: number; }
export interface OnrampQuote { rate: number; fee_input: number; network_fee_input: number; expires_at: number; }
export type OnrampStatus = "CREATED" | "PAYMENT_PENDING" | "PAYMENT_RECEIVED" | "WITHDRAWAL_INITIATED" | "CONFIRMATIONS_PENDING" | "COMPLETED" | "EXPIRED" | "FAILED";
export interface OnrampOrder { order_id: string; upi_qr: string; upi_intent: string; input_amount: number; fee_input: number; network_fee_input: number; rate: number; expires_at: number; }
export interface OnrampOrderDetail { order_id: string; status: OnrampStatus; input_amount: number; output_amount: number; output_currency: string; destination_address: string; rate: number; fee_input: number; network_fee_input: number; created_at: number; }
export interface CreateOnrampOrderParams { pair_id: string; amount: number; customer_id: string; first_name: string; last_name: string; destination_address: string; }

// ── Raw shapes — Offramp ──────────────────────────────────────────────────────

export interface OfframpPair { pair_id: string; input_currency: string; output_currency: string; blockchain: string; min_input_amount: number; max_input_amount: number; fee_bps: number; network_fees: number; processing_time_min: number; processing_time_max: number; }
export interface OfframpQuote { rate: number; fee_input: number; network_fee_input: number; expires_at: number; }
export type OfframpStatus = "CREATED" | "DEPOSIT_PENDING" | "DEPOSIT_CONFIRMED" | "PAYOUT_INITIATED" | "PAYOUT_COMPLETED" | "FAILED";
export interface OfframpBankAccount { bank_account_id: string; account_number: string; ifsc: string; account_holder_name: string; bank_name: string; is_default: boolean; }
export interface OfframpOrder { order_id: string; deposit_address: string; blockchain: string; input_amount: number; input_currency: string; output_amount: number; expires_at: number; }
export interface OfframpOrderDetail { order_id: string; status: OfframpStatus; input_amount: number; input_currency: string; output_amount: number; output_currency: string; deposit_address: string; bank_account_id: string; rate: number; fee_input: number; network_fee_input: number; payout_utr?: string; created_at: number; }
export interface BankAccountReview { would_pass: boolean; name_match_score: number; account_holder_name_from_bank: string; is_nre_account: boolean; }

// ── Raw shapes — Remittance ────────────────────────────────────────────────────

export interface RemBalance { balance: number; currency: string; total_credit_limit: number; consumed_credit: number; available_credit: number; }
export interface RemBalances { balances: { currency: string; balance: number }[]; available_balance_usd: number; consumed_credit_usd: number; total_credit_limit_usd: number; }
export interface FxRate { fx_rate: number; input_currency: string; output_currency: string; expiry: string; type: string; purpose: string; party: string; }
export interface DepositAddress { address: string; currency: string; blockchain: string; chain: string; }
export interface DepositRecord { amount: number; blockchain: string; blockchain_txid: string; created: number; currency: string; source_address: string; wallet_address: string; }
export interface RemLedgerEntry { after_balance: number; amount: number; before_balance: number; created: number; currency: string; description: string; ledger_id: string; transaction_id: string; type: string; }
export interface BankValidation { status: "completed" | "failed"; transaction_reference_no?: string; account_holder_name_from_bank?: string; is_nre_account?: boolean; failure_reason?: string; }
export interface TradeResult { trade_id: string; status: string; from_currency: string; from_amount: number; to_currency: string; to_amount: number; fx_rate_effective: number; trades_fees_percentage: number; fee_amount: number; fee_currency: string; after_balance_from: number; after_balance_to: number; }
export interface PayoutRecord {
  account_holder_name: string; account_number: string; amount: number; created: number; currency: string;
  ifsc?: string; merchant_payout_id: string; payout_id: string; payout_process_type?: string; payout_method?: string;
  upi_id?: string; status: string; fees_amount?: number; fees_percentage?: number; fx_rate?: number;
  tds_amount?: number; tds_percentage?: number; transaction_reference_no?: string; sub_account_id?: string;
}
export interface RemPayoutResult { after_balance: number; before_balance: number; payout_id: string; status: string; fx_rate_at_payout?: number; }
export interface SubAccount { created: number; label: string; sub_account_id: string; }

export interface InitiateInrPayoutParams {
  amount: number; currency: "inr" | "inr_e";
  account_number?: string; ifsc?: string; upi_id?: string;
  account_holder_name: string; merchant_payout_id?: string;
  purpose?: "crypto_offramp" | "trade_finance";
  receiver_customer_id?: string; sender_customer_id?: string;
  sub_account_id?: string; wallet?: "payout" | "collection";
}

export interface InitiateCrossBorderPayoutParams {
  amount: number; merchant_payout_id?: string;
  account_holder_name: string; account_number: string;
  bank_name: string; bank_code: string;
  sender_customer_id?: string; receiver_customer_id?: string;
  is_recipient_self?: boolean; sub_account_id?: string; wallet?: "payout" | "collection";
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapCollection(r: RawCollection): BankingTransaction {
  return { id: r.collection_id, merchantReferenceId: r.merchant_collection_id, type: "collection", amount: r.amount, currency: r.currency ?? "INR", status: r.status, description: r.description, createdAt: r.created_at, upiIntent: r.upi_intent, qrCode: r.qr_code, redirectUrl: r.redirect_url };
}
function mapCollPayout(r: RawCollPayout): BankingTransaction {
  return { id: r.payout_id, merchantReferenceId: r.merchant_payout_id, type: "payout", amount: r.amount, currency: r.currency ?? "INR", status: r.status, description: r.description, createdAt: r.created_at };
}

// ── Provider class ─────────────────────────────────────────────────────────────

class CredibleFinanceProvider implements BankingProvider {
  readonly id = "credible";
  readonly name = "Credible Finance";
  readonly description = "Collections, Payouts, Onramp & Offramp · Multi-currency";
  readonly currency = "INR";
  readonly currencySymbol = "₹";
  readonly flag = "🇮🇳";
  readonly minCollectionAmount = 300;

  isConfigured(): boolean {
    return !!(process.env.CREDIBLE_FINANCE_API_KEY && process.env.CREDIBLE_FINANCE_API_SECRET);
  }

  // ── Collections ──────────────────────────────────────────────────────────────

  async getBalance(currency = "inr"): Promise<ProviderBalance> {
    const data = await col<RawCollBalance>("GET", "/getMerchantBalance", { query: { currency } });
    return { amount: data.balance, currency: data.currency?.toUpperCase() ?? "INR", currencySymbol: "₹" };
  }

  async getTransactions(): Promise<BankingTransaction[]> {
    const result = await col<RawCollectionList>("GET", "/getCollections");
    return result.data.map(mapCollection);
  }

  async getTransaction(id: string): Promise<BankingTransaction> {
    const data = await col<RawCollection>("GET", "/getCollectionInfo", { query: { collection_id: id } });
    return mapCollection(data);
  }

  async initiateCollection(userId: string, params: CollectionParams): Promise<CollectionResult> {
    const merchant_collection_id = `${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const body: Record<string, unknown> = { amount: params.amount, currency: "INR", merchant_collection_id, customer_id: params.customerRef ?? userId };
    if (params.description) body.description = params.description;
    const data = await col<RawCollection>("POST", "/initiateCollection", { body });
    return mapCollection(data) as CollectionResult;
  }

  async initiatePayout(userId: string, params: PayoutParams): Promise<PayoutResult> {
    const merchant_payout_id = `payout-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const body: Record<string, unknown> = { amount: params.amount, currency: "INR", merchant_payout_id, account_holder_name: params.beneficiaryName, account_number: params.beneficiaryAccountNumber, ifsc: params.beneficiaryIfsc, wallet: "collection" };
    if (params.description) body.description = params.description;
    const data = await col<RawCollPayout>("POST", "/initiatePayout", { body });
    return mapCollPayout(data) as PayoutResult;
  }

  async transferToPayout(currency: string, amount: number): Promise<{ afterCollectionBalance: number; afterPayoutBalance: number; currency: string }> {
    const data = await col<{ after_collection_balance: number; after_payout_balance: number; currency: string }>("POST", "/transferToPayout", { body: { currency, amount } });
    return { afterCollectionBalance: data.after_collection_balance, afterPayoutBalance: data.after_payout_balance, currency: data.currency };
  }

  async getWalletLedger(page = 1, limit = 20): Promise<{ data: RawLedgerEntry[]; totalCount: number }> {
    const result = await col<{ data: RawLedgerEntry[]; total_count: number }>("GET", "/getWalletLedger", { query: { page, limit } });
    return { data: result.data, totalCount: result.total_count };
  }

  // ── Onramp ───────────────────────────────────────────────────────────────────

  async getOnrampPairs(): Promise<{ data: OnrampPair[] }> { return onr<{ data: OnrampPair[] }>("GET", "/currency-pairs"); }
  async getOnrampRate(pairId: string, amount?: number): Promise<{ data: OnrampQuote }> {
    const query: Record<string, string | number> = { pair_id: pairId };
    if (amount !== undefined) query.amount = amount;
    return onr<{ data: OnrampQuote }>("GET", "/rate", { query });
  }
  async createOnrampOrder(params: CreateOnrampOrderParams): Promise<{ data: OnrampOrder }> {
    return onr<{ data: OnrampOrder }>("POST", "/createOrder", { body: { pair_id: params.pair_id, amount: params.amount, customer_id: params.customer_id, first_name: params.first_name, last_name: params.last_name, destination_address: params.destination_address } });
  }
  async getOnrampOrder(orderId: string): Promise<{ data: OnrampOrderDetail }> { return onr<{ data: OnrampOrderDetail }>("GET", "/order", { query: { order_id: orderId } }); }
  async listOnrampOrders(opts: { page?: number; limit?: number; status?: string; customer_id?: string } = {}): Promise<{ data: OnrampOrderDetail[]; totalCount: number }> {
    const query: Record<string, string | number> = { page: opts.page ?? 0, limit: opts.limit ?? 10 };
    if (opts.status) query.status = opts.status;
    if (opts.customer_id) query.customer_id = opts.customer_id;
    return onr<{ data: OnrampOrderDetail[]; totalCount: number }>("GET", "/orders", { query });
  }

  // ── Offramp ──────────────────────────────────────────────────────────────────

  async getOfframpPairs(): Promise<{ data: OfframpPair[] }> { return off<{ data: OfframpPair[] }>("GET", "/currency-pairs"); }

  async getOfframpRate(pairId: string, amount?: number): Promise<{ data: OfframpQuote }> {
    const query: Record<string, string | number> = { pair_id: pairId };
    if (amount !== undefined) query.amount = amount;
    return off<{ data: OfframpQuote }>("GET", "/rate", { query });
  }

  async addBankAccount(params: { customer_id: string; first_name: string; last_name: string; account_number: string; ifsc: string }): Promise<{ data: OfframpBankAccount }> {
    return off<{ data: OfframpBankAccount }>("POST", "/bank-accounts", { body: params });
  }

  async listBankAccounts(customerId: string): Promise<{ data: OfframpBankAccount[] }> {
    return off<{ data: OfframpBankAccount[] }>("GET", "/bank-accounts", { query: { customer_id: customerId } });
  }

  async deactivateBankAccount(bankAccountId: string, customerId: string): Promise<{ data: { deactivated: boolean } }> {
    return off<{ data: { deactivated: boolean } }>("POST", "/bank-accounts/deactivate", { body: { bank_account_id: bankAccountId, customer_id: customerId } });
  }

  async reviewBankAccount(params: { customer_id: string; first_name: string; last_name: string; account_number: string; ifsc: string }): Promise<{ data: BankAccountReview }> {
    return off<{ data: BankAccountReview }>("POST", "/bank-accounts/review", { body: params });
  }

  async createOfframpOrder(params: { pair_id: string; amount: number; customer_id: string; first_name: string; last_name: string; bank_account_id: string }): Promise<{ data: OfframpOrder }> {
    return off<{ data: OfframpOrder }>("POST", "/createOrder", { body: params });
  }

  async getOfframpOrder(orderId: string): Promise<{ data: OfframpOrderDetail }> { return off<{ data: OfframpOrderDetail }>("GET", "/order", { query: { order_id: orderId } }); }

  async listOfframpOrders(opts: { page?: number; limit?: number; status?: string; customer_id?: string } = {}): Promise<{ data: OfframpOrderDetail[]; totalCount: number }> {
    const query: Record<string, string | number> = { page: opts.page ?? 0, limit: opts.limit ?? 10 };
    if (opts.status) query.status = opts.status;
    if (opts.customer_id) query.customer_id = opts.customer_id;
    return off<{ data: OfframpOrderDetail[]; totalCount: number }>("GET", "/orders", { query });
  }

  // ── Remittance — Forex ────────────────────────────────────────────────────────

  async getFxRate(opts: { input_currency?: string; output_currency?: string; type?: string; purpose?: string; party?: string } = {}): Promise<FxRate> {
    const query: Record<string, string | number> = {
      input_currency: opts.input_currency ?? "USDT",
      output_currency: opts.output_currency ?? "INR",
      type: opts.type ?? "individual",
      purpose: opts.purpose ?? "crypto_offramp",
      party: opts.party ?? "receiver",
    };
    return rem<FxRate>("GET", "/getFxRate", { query });
  }

  // ── Remittance — Balances ─────────────────────────────────────────────────────

  async getPayoutBalance(currency = "usd"): Promise<RemBalance> {
    return rem<RemBalance>("GET", "/getMerchantBalance", { query: { currency } });
  }

  async getPayoutCreditLimit(currency = "usdt"): Promise<{ available_credit: number; total_credit_limit: number; consumed_credit: number; currency: string }> {
    return rem<{ available_credit: number; total_credit_limit: number; consumed_credit: number; currency: string }>("GET", "/getMerchantCreditLimit", { query: { currency } });
  }

  // ── Remittance — Deposits ─────────────────────────────────────────────────────

  async getDepositAddress(opts: { currency: string; blockchain: string; chain?: string; wallet_count?: number; sub_account_id?: string }): Promise<DepositAddress[]> {
    const query: Record<string, string | number> = { currency: opts.currency, blockchain: opts.blockchain, wallet_count: opts.wallet_count ?? 1, sub_account_id: opts.sub_account_id ?? "main" };
    if (opts.chain) query.chain = opts.chain;
    return rem<DepositAddress[]>("GET", "/getDepositAddress", { query });
  }

  async getDepositHistory(opts: { page?: number; limit?: number; sub_account_id?: string } = {}): Promise<{ data: DepositRecord[]; total_count: number }> {
    return rem<{ data: DepositRecord[]; total_count: number }>("GET", "/getDepositHistory", { query: { page: opts.page ?? 0, limit: opts.limit ?? 10, sub_account_id: opts.sub_account_id ?? "main" } });
  }

  // ── Remittance — Wallet ledger (payout wallet) ────────────────────────────────

  async getPayoutWalletLedger(page = 0, limit = 10): Promise<{ data: RemLedgerEntry[]; total_count: number }> {
    return rem<{ data: RemLedgerEntry[]; total_count: number }>("GET", "/getWalletLedger", { query: { page, limit } });
  }

  // ── Remittance — Validations ───────────────────────────────────────────────────

  async validateBankAccount(params: { currency: string; account_number: string; ifsc: string; account_holder_name: string; sub_account_id?: string; wallet?: string }): Promise<BankValidation> {
    const body: Record<string, unknown> = { currency: params.currency, account_number: params.account_number, ifsc: params.ifsc, account_holder_name: params.account_holder_name };
    if (params.sub_account_id) body.sub_account_id = params.sub_account_id;
    if (params.wallet) body.wallet = params.wallet;
    return rem<BankValidation>("POST", "/validateBankAccount", { body });
  }

  // ── Remittance — Trades ────────────────────────────────────────────────────────

  async initiateTrade(params: { from_currency: string; to_currency: string; from_amount: number; sub_account_id?: string; merchant_trade_id?: string }): Promise<TradeResult> {
    const body: Record<string, unknown> = { from_currency: params.from_currency, to_currency: params.to_currency, from_amount: params.from_amount };
    if (params.sub_account_id) body.sub_account_id = params.sub_account_id;
    if (params.merchant_trade_id) body.merchant_trade_id = params.merchant_trade_id;
    return rem<TradeResult>("POST", "/trade", { body });
  }

  async getTradeHistory(opts: { page?: number; limit?: number; from_currency?: string; to_currency?: string; sub_account_id?: string } = {}): Promise<{ trades: unknown[]; total: number; page: number; limit: number }> {
    const query: Record<string, string | number> = { page: opts.page ?? 1, limit: opts.limit ?? 20 };
    if (opts.from_currency) query.from_currency = opts.from_currency;
    if (opts.to_currency) query.to_currency = opts.to_currency;
    if (opts.sub_account_id) query.sub_account_id = opts.sub_account_id;
    return rem<{ trades: unknown[]; total: number; page: number; limit: number }>("GET", "/tradeHistory", { query });
  }

  // ── Remittance — Payouts ───────────────────────────────────────────────────────

  async getPayoutInfo(params: { payout_id?: string; merchant_payout_id?: string }): Promise<PayoutRecord> {
    const query: Record<string, string> = {};
    if (params.payout_id) query.payout_id = params.payout_id;
    if (params.merchant_payout_id) query.merchant_payout_id = params.merchant_payout_id;
    return rem<PayoutRecord>("GET", "/getPayoutInfo", { query });
  }

  async listPayouts(opts: { page?: number; limit?: number; status?: string; sub_account_id?: string; payout_id?: string; merchant_payout_id?: string } = {}): Promise<{ data: PayoutRecord[]; total_count: number }> {
    const query: Record<string, string | number> = { page: opts.page ?? 0, limit: opts.limit ?? 10, status: opts.status ?? "all", sub_account_id: opts.sub_account_id ?? "all" };
    if (opts.payout_id) query.payout_id = opts.payout_id;
    if (opts.merchant_payout_id) query.merchant_payout_id = opts.merchant_payout_id;
    return rem<{ data: PayoutRecord[]; total_count: number }>("GET", "/getPayouts", { query });
  }

  async initiateInrPayout(userId: string, params: InitiateInrPayoutParams): Promise<RemPayoutResult> {
    const merchant_payout_id = params.merchant_payout_id ?? `inrpay-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const body: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency ?? "inr",
      account_holder_name: params.account_holder_name,
      merchant_payout_id,
      purpose: params.purpose ?? "crypto_offramp",
      sub_account_id: params.sub_account_id ?? "main",
      wallet: params.wallet ?? "payout",
    };
    if (params.account_number) body.account_number = params.account_number;
    if (params.ifsc) body.ifsc = params.ifsc;
    if (params.upi_id) body.upi_id = params.upi_id;
    if (params.receiver_customer_id) body.receiver_customer_id = params.receiver_customer_id;
    if (params.sender_customer_id) body.sender_customer_id = params.sender_customer_id;
    return rem<RemPayoutResult>("POST", "/initiatePayoutV2", { body });
  }

  async initiateIdrPayout(userId: string, params: InitiateCrossBorderPayoutParams): Promise<RemPayoutResult> {
    const body: Record<string, unknown> = {
      amount: params.amount,
      merchant_payout_id: params.merchant_payout_id ?? `idrpay-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      account_holder_name: params.account_holder_name,
      account_number: params.account_number,
      bank_name: params.bank_name,
      bank_code: params.bank_code,
      is_recipient_self: params.is_recipient_self ?? false,
      sub_account_id: params.sub_account_id ?? "main",
      wallet: params.wallet ?? "payout",
    };
    if (params.sender_customer_id) body.sender_customer_id = params.sender_customer_id;
    if (params.receiver_customer_id) body.receiver_customer_id = params.receiver_customer_id;
    return rem<RemPayoutResult>("POST", "/initiateIdrPayout", { body });
  }

  async initiatePhpPayout(userId: string, params: InitiateCrossBorderPayoutParams): Promise<RemPayoutResult> {
    const body: Record<string, unknown> = {
      amount: params.amount,
      merchant_payout_id: params.merchant_payout_id ?? `phppay-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      account_holder_name: params.account_holder_name,
      account_number: params.account_number,
      bank_name: params.bank_name,
      bank_code: params.bank_code,
      is_recipient_self: params.is_recipient_self ?? false,
      sub_account_id: params.sub_account_id ?? "main",
      wallet: params.wallet ?? "payout",
    };
    if (params.sender_customer_id) body.sender_customer_id = params.sender_customer_id;
    if (params.receiver_customer_id) body.receiver_customer_id = params.receiver_customer_id;
    return rem<RemPayoutResult>("POST", "/initiatePhpPayout", { body });
  }

  async initiateVndPayout(userId: string, params: InitiateCrossBorderPayoutParams): Promise<RemPayoutResult> {
    const body: Record<string, unknown> = {
      amount: params.amount,
      merchant_payout_id: params.merchant_payout_id ?? `vndpay-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      account_holder_name: params.account_holder_name,
      account_number: params.account_number,
      bank_name: params.bank_name,
      bank_code: params.bank_code,
      is_recipient_self: params.is_recipient_self ?? false,
      sub_account_id: params.sub_account_id ?? "main",
      wallet: params.wallet ?? "payout",
    };
    if (params.sender_customer_id) body.sender_customer_id = params.sender_customer_id;
    if (params.receiver_customer_id) body.receiver_customer_id = params.receiver_customer_id;
    return rem<RemPayoutResult>("POST", "/initiateVndPayout", { body });
  }

  // ── Remittance — Sub Accounts ──────────────────────────────────────────────────

  async createSubAccount(label?: string): Promise<{ label: string; sub_account_id: string }> {
    const body: Record<string, unknown> = {};
    if (label) body.label = label;
    return rem<{ label: string; sub_account_id: string }>("POST", "/createNewSubAccount", { body });
  }

  async getAllSubAccounts(page = 0, limit = 10): Promise<{ data: SubAccount[]; total_count: number }> {
    return rem<{ data: SubAccount[]; total_count: number }>("GET", "/getAllSubaccounts", { query: { page, limit } });
  }

  async getSubAccountBalance(currency = "usd", sub_account_id = "main"): Promise<RemBalances> {
    return rem<RemBalances>("GET", "/getSubAccountBalance", { query: { currency, sub_account_id } });
  }

  async transferSubAccountFunds(params: { amount: number; currency: string; from_sub_account_id?: string; to_sub_account_id?: string }): Promise<{ transfer_id: string }> {
    return rem<{ transfer_id: string }>("POST", "/transferFunds", {
      body: { amount: params.amount, currency: params.currency, from_sub_account_id: params.from_sub_account_id ?? "main", to_sub_account_id: params.to_sub_account_id ?? "main" },
    });
  }

  // ── Webhook verification ──────────────────────────────────────────────────────

  verifyWebhook(body: Record<string, unknown>): boolean {
    const { metadata, signature } = body as { metadata?: object; signature?: string };
    if (!metadata || !signature) return false;
    const secret = process.env.CREDIBLE_FINANCE_API_SECRET ?? "";
    const expected = crypto.createHmac("sha256", secret).update(sortedJsonStringify(metadata)).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    } catch { return false; }
  }
}

export const credibleProvider = new CredibleFinanceProvider();
