// ── Shared types every banking provider must implement ─────────────────────────

export interface ProviderBalance {
  amount: number;
  currency: string;
  currencySymbol: string;
  subAccountId?: string;
}

export type TransactionStatus =
  | "initiated"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

export interface BankingTransaction {
  id: string;
  merchantReferenceId: string;
  type: "collection" | "payout";
  amount: number;
  currency: string;
  status: TransactionStatus;
  description?: string;
  createdAt?: string;
  /** For collections — render as QR to pay */
  upiIntent?: string;
  /** For collections — pre-rendered QR image (URL or base64) */
  qrCode?: string;
  /** For collections — hosted checkout page */
  redirectUrl?: string;
}

export interface CollectionParams {
  amount: number;
  description?: string;
  customerRef?: string;
}

export interface CollectionResult extends BankingTransaction {
  type: "collection";
}

export interface PayoutParams {
  amount: number;
  description?: string;
  beneficiaryName: string;
  beneficiaryAccountNumber: string;
  beneficiaryIfsc: string;
}

export interface PayoutResult extends BankingTransaction {
  type: "payout";
}

// ── The contract every provider must satisfy ───────────────────────────────────

export interface BankingProvider {
  /** Unique slug — used in URL paths, e.g. "credible" */
  readonly id: string;
  /** Human-readable name shown in the UI */
  readonly name: string;
  /** Short description */
  readonly description: string;
  /** Currency code this provider settles in, e.g. "INR" */
  readonly currency: string;
  /** Symbol to display, e.g. "₹" */
  readonly currencySymbol: string;
  /** Emoji flag or logo shorthand */
  readonly flag: string;
  /** Minimum collection amount in the provider currency */
  readonly minCollectionAmount: number;

  /** Returns true if required env vars are set */
  isConfigured(): boolean;

  getBalance(subAccountId?: string): Promise<ProviderBalance>;
  getTransactions(): Promise<BankingTransaction[]>;
  getTransaction(id: string): Promise<BankingTransaction>;
  initiateCollection(userId: string, params: CollectionParams): Promise<CollectionResult>;
  initiatePayout(userId: string, params: PayoutParams): Promise<PayoutResult>;
  verifyWebhook(body: Record<string, unknown>): boolean;
}
