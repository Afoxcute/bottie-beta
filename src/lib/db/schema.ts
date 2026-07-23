import { pgTable, uuid, text, timestamp, numeric, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  vaultId: text("vault_id").notNull(),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 28, scale: 18 }).notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("goals_user_vault_idx").on(table.userId, table.vaultId),
]);

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  vaultId: text("vault_id"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// bills table
export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(), // "streaming" | "cable" | "internet" | "utility" | "investment"
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(), // USDC amount
  dueDate: text("due_date"),
  payeeAddress: text("payee_address"),
  autopay: boolean("autopay").default(false).notNull(),
  status: text("status").default("pending").notNull(), // "pending" | "paid" | "overdue"
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// investments table
export const investments = pgTable("investments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "stock" | "ipo" | "etf"
  shares: numeric("shares", { precision: 18, scale: 8 }).notNull(),
  avgPriceUsd: numeric("avg_price_usd", { precision: 18, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// payments table
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // "bill" | "investment"
  referenceId: text("reference_id"),
  description: text("description").notNull(),
  amountUsdc: text("amount_usdc").notNull(),
  status: text("status").notNull(), // "pending" | "completed" | "failed"
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
