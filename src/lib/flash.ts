import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  FlashPerpetualsClient,
  PoolConfig,
  PROGRAM_ID,
  Side,
  openPosition,
  closePosition,
  decreasePositionSize,
  addCollateral,
  removeCollateral,
  placeLimitOrder,
  placeTriggerOrder,
  cancelLimitOrder,
  cancelTriggerOrder,
  editLimitOrder,
  editTriggerOrder,
  increasePositionSize,
  initializeBasket,
  initializeUserDepositLedger,
  delegateBasket,
  findBasketAddress,
  findDelegationSiblings,
  type BasketAccount,
} from "@flash_trade/flash-sdk-v2";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

export { Side, BN };

// ── Constants ─────────────────────────────────────────────────────────────────

export const FLASH_CLUSTER = "mainnet-beta" as const;
const WSOL = "So11111111111111111111111111111111111111112";
const SOL_RPC =
  process.env.FLASH_SOLANA_RPC ||
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}` ||
  "https://api.mainnet-beta.solana.com";
const ER_RPC = process.env.FLASH_ER_RPC || "https://flash.magicblock.xyz";

// ── Client singleton ──────────────────────────────────────────────────────────

let _client: FlashPerpetualsClient | null = null;
let _poolConfig: PoolConfig | null = null;

function getFlashClient() {
  if (_client) return { client: _client, poolConfig: _poolConfig! };
  const dummyKp = Keypair.generate();
  const connection = new Connection(SOL_RPC, "confirmed");
  const dummyWallet = {
    publicKey: dummyKp.publicKey,
    signTransaction: async <T>(tx: T) => tx,
    signAllTransactions: async <T>(txs: T[]) => txs,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
  const pc = PoolConfig.fromIdsByName("Crypto.1", FLASH_CLUSTER);
  const client = new FlashPerpetualsClient(
    provider,
    undefined,
    PROGRAM_ID[FLASH_CLUSTER],
    { prioritizationFee: 5000 },
    ER_RPC,
  );
  _client = client;
  _poolConfig = pc;
  return { client, poolConfig: pc };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export type FlashToken = {
  symbol: string;
  mintKey: string;
  decimals: number;
  isStable: boolean;
  iconUrl?: string;
};

export type FlashMarket = {
  marketId: number;
  name: string;
  symbol: string;
  side: "long" | "short";
  collateralSymbol: string;
  collateralMint: string;
  targetMint: string;
  maxLev: number;
  marketAccount: string;
  targetCustody: string;
  collateralCustody: string;
};

function buildTokenMap(poolConfig: PoolConfig): Record<string, FlashToken> {
  const map: Record<string, FlashToken> = {};
  poolConfig.tokens.forEach((t: { mintKey: { toString: () => string }; symbol: string; decimals: number; isStable: boolean; iconUrl?: string }) => {
    const mint = t.mintKey.toString();
    map[mint] = { symbol: t.symbol, mintKey: mint, decimals: t.decimals, isStable: t.isStable, iconUrl: t.iconUrl };
  });
  map[WSOL] = { symbol: "SOL", mintKey: WSOL, decimals: 9, isStable: false };
  return map;
}

function getAnyClient(client: FlashPerpetualsClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = client as any;
  const erProgram = any.getErProgram?.() ?? any.erProgram;
  const oracleOf = (custody: unknown): Promise<PublicKey> => any.oracleOf(custody) as Promise<PublicKey>;
  return { erProgram, oracleOf };
}

async function buildTx(owner: PublicKey, ixs: unknown): Promise<string> {
  const connection = new Connection(SOL_RPC, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner });
  tx.add(...(Array.isArray(ixs) ? ixs : [ixs]));
  return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
}

// Returns an initializeBasket ix if the user's basket account doesn't exist yet, else null.
async function maybeInitBasketIx(client: FlashPerpetualsClient, owner: PublicKey) {
  const { erProgram } = getAnyClient(client);
  const connection = new Connection(SOL_RPC, "confirmed");
  const [basketPda] = findBasketAddress(owner, erProgram.programId);
  const info = await connection.getAccountInfo(basketPda);
  if (info) return null;
  return initializeBasket(erProgram, owner);
}

// Returns a delegateBasket ix if the basket hasn't been delegated to the ER yet, else null.
// MagicBlock requires the basket to be delegated before any ER instruction can use it.
async function maybeDelegateBasketIx(client: FlashPerpetualsClient, owner: PublicKey) {
  const { erProgram } = getAnyClient(client);
  const connection = new Connection(SOL_RPC, "confirmed");
  const [basketPda] = findBasketAddress(owner, erProgram.programId);
  const { delegationRecord } = findDelegationSiblings(basketPda, erProgram.programId);
  const info = await connection.getAccountInfo(delegationRecord);
  if (info) return null; // already delegated
  return delegateBasket(erProgram, owner);
}

// Returns an initializeUserDepositLedger ix if the ledger doesn't exist yet, else null.
async function maybeInitDepositLedgerIx(client: FlashPerpetualsClient, owner: PublicKey) {
  const { erProgram } = getAnyClient(client);
  const connection = new Connection(SOL_RPC, "confirmed");
  // Ledger PDA seed: ["user_deposit_ledger", owner]
  const [ledgerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit_ledger"), owner.toBuffer()],
    erProgram.programId,
  );
  const info = await connection.getAccountInfo(ledgerPda);
  if (info) return null;
  return initializeUserDepositLedger(erProgram, owner);
}

// ── Markets ───────────────────────────────────────────────────────────────────

export function getMarketsInfo(): FlashMarket[] {
  const { poolConfig } = getFlashClient();
  const tokens = buildTokenMap(poolConfig);
  return poolConfig.markets
    .filter((m: { marketNameUi?: string }) => m.marketNameUi)
    .map((m: {
      marketId: number; marketNameUi: string;
      targetMint: { toString: () => string }; collateralMint: { toString: () => string };
      side: Record<string, unknown>; maxLev: number;
      marketAccount: { toString: () => string };
      targetCustody: { toString: () => string }; collateralCustody: { toString: () => string };
    }) => ({
      marketId: m.marketId,
      name: m.marketNameUi,
      symbol: tokens[m.targetMint.toString()]?.symbol ?? "?",
      side: Object.keys(m.side)[0] as "long" | "short",
      collateralSymbol: tokens[m.collateralMint.toString()]?.symbol ?? "?",
      collateralMint: m.collateralMint.toString(),
      targetMint: m.targetMint.toString(),
      maxLev: m.maxLev,
      marketAccount: m.marketAccount.toString(),
      targetCustody: m.targetCustody.toString(),
      collateralCustody: m.collateralCustody.toString(),
    }));
}

// ── Open position quote ───────────────────────────────────────────────────────

export async function getOpenQuote(params: {
  marketId: number;
  collateralUsd: number;
  leverage: number;
}) {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const amountIn = new BN(Math.floor(params.collateralUsd * 10 ** colDec));
  const leverageBps = new BN(params.leverage * 10000);
  try {
    const q = await client.views.getOpenPositionQuoteEr(poolConfig, {
      market: market.marketAccount,
      targetSymbol: target?.symbol ?? "SOL",
      collateralSymbol: collateral?.symbol ?? "USDC",
      receivingSymbol: collateral?.symbol ?? "USDC",
      amountIn,
      leverage: leverageBps,
    });
    return {
      entryPrice: q.entryPrice ? Number(q.entryPrice) / 1e6 : null,
      sizeAmount: q.sizeAmount ? q.sizeAmount.toString() : null,
      fee: q.totalFeeUsd ? Number(q.totalFeeUsd) / 1e6 : null,
      collateral: params.collateralUsd,
      leverage: params.leverage,
      collateralSymbol: collateral?.symbol ?? "USDC",
    };
  } catch {
    return { entryPrice: null, sizeAmount: null, fee: null, collateral: params.collateralUsd, leverage: params.leverage, collateralSymbol: collateral?.symbol ?? "USDC" };
  }
}

// ── Close position quote ──────────────────────────────────────────────────────

export async function getCloseQuote(params: {
  ownerAddress: string;
  marketId: number;
  sizeDeltaUsd?: number; // undefined = full close
}) {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const sizeDeltaUsd = params.sizeDeltaUsd != null
    ? new BN(Math.floor(params.sizeDeltaUsd * 1e6))
    : new BN(0);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (client.views as any).getClosePositionQuoteEr(poolConfig, {
      owner,
      market: market.marketAccount,
      targetSymbol: target?.symbol ?? "SOL",
      collateralSymbol: collateral?.symbol ?? "USDC",
      dispensingSymbol: collateral?.symbol ?? "USDC",
      sizeDeltaUsd,
    });
    const isProfitable = q.isProfitable ?? false;
    const pnlRaw = isProfitable
      ? (q.profitUsd ? Number(q.profitUsd) / 1e6 : null)
      : (q.lossUsd ? -Number(q.lossUsd) / 1e6 : null);
    return {
      exitPrice: q.markPrice ? Number(q.markPrice) / 1e6 : null,
      fee: q.exitFeeUsd ? Number(q.exitFeeUsd) / 1e6 : null,
      pnl: pnlRaw,
      receiveAmount: q.receiveTokenAmount ? Number(q.receiveTokenAmount) / 10 ** colDec : null,
      collateralSymbol: collateral?.symbol ?? "USDC",
    };
  } catch {
    return { exitPrice: null, fee: null, pnl: null, receiveAmount: null, collateralSymbol: collateral?.symbol ?? "USDC" };
  }
}

// ── PnL & liquidation price ───────────────────────────────────────────────────

export async function getPositionStats(params: {
  ownerAddress: string;
  marketId: number;
}) {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const views = client.views as any;
    const [pnl, liqPrice] = await Promise.allSettled([
      views.getPnlEr(poolConfig, { owner, market: market.marketAccount, targetSymbol: target?.symbol ?? "SOL", collateralSymbol: collateral?.symbol ?? "USDC" }),
      views.getLiquidationPriceEr(poolConfig, { owner, market: market.marketAccount, targetSymbol: target?.symbol ?? "SOL", collateralSymbol: collateral?.symbol ?? "USDC" }),
    ]);
    return {
      pnl: pnl.status === "fulfilled" && pnl.value?.profitUsd != null
        ? Number(pnl.value.profitUsd) / 10 ** colDec - (pnl.value?.lossUsd ? Number(pnl.value.lossUsd) / 10 ** colDec : 0)
        : null,
      liqPrice: liqPrice.status === "fulfilled" && liqPrice.value
        ? Number(liqPrice.value) / 1e6
        : null,
    };
  } catch {
    return { pnl: null, liqPrice: null };
  }
}

// ── Positions & orders ────────────────────────────────────────────────────────

function bnToNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof (v as { toNumber?: () => number }).toNumber === "function") return (v as { toNumber: () => number }).toNumber();
  return Number(v);
}

function decodeOraclePrice(p: unknown): number | null {
  if (!p) return null;
  const op = p as { price?: unknown; exponent?: unknown };
  if (op.price == null || op.exponent == null) return null;
  const price = bnToNum(op.price);
  const exp = bnToNum(op.exponent);
  return price * Math.pow(10, exp);
}

export async function getUserPositions(walletAddress: string) {
  const { client, poolConfig } = getFlashClient();
  const tokens = buildTokenMap(poolConfig);

  // Map market account pubkey string → pool config array index (= marketId used by all routes)
  const marketPkToIdx: Record<string, number> = {};
  (poolConfig.markets as { marketAccount: { toString: () => string } }[]).forEach((m, i) => {
    marketPkToIdx[m.marketAccount.toString()] = i;
  });

  try {
    const ownerPk = new PublicKey(walletAddress);
    const basket: BasketAccount = await client.erAccounts!.fetchBasket(ownerPk);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = ((basket.positions ?? []) as any[])
      .filter(p => bnToNum(p?.sizeAmount) > 0)
      .map(p => {
        const marketPk = p.market?.toString() ?? "";
        const marketId = marketPkToIdx[marketPk] ?? -1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mCfg = marketId >= 0 ? (poolConfig.markets as any[])[marketId] : null;
        const target = mCfg ? (tokens[mCfg.targetMint.toString()] ?? tokens[WSOL]) : null;
        const collateral = mCfg ? tokens[mCfg.collateralMint.toString()] : null;
        const side = mCfg ? (Object.keys(mCfg.side)[0] as string) : "unknown";
        return {
          marketId,
          marketAccount: marketPk,
          symbol: target?.symbol ?? "?",
          side,
          collateralSymbol: collateral?.symbol ?? "USDC",
          entryPriceUsd: decodeOraclePrice(p.entryPrice),
          sizeUsd: bnToNum(p.sizeUsd) / 1e6,
          collateralUsd: bnToNum(p.collateralUsd) / 1e6,
          isActive: p.isActive ?? true,
        };
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = ((basket.orders ?? []) as any[])
      .filter(o => o?.isActive !== false && bnToNum(o?.sizeAmount) > 0)
      .map(o => {
        const marketPk = o.market?.toString() ?? "";
        const marketId = marketPkToIdx[marketPk] ?? -1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mCfg = marketId >= 0 ? (poolConfig.markets as any[])[marketId] : null;
        const target = mCfg ? (tokens[mCfg.targetMint.toString()] ?? tokens[WSOL]) : null;
        const side = mCfg ? (Object.keys(mCfg.side)[0] as string) : "unknown";
        return {
          marketId,
          marketAccount: marketPk,
          orderId: o.orderId ?? null,
          symbol: target?.symbol ?? "?",
          side,
          isStopLoss: o.isStopLoss ?? null,
          limitPrice: decodeOraclePrice(o.limitPrice),
          triggerPrice: decodeOraclePrice(o.triggerPrice),
          sizeUsd: bnToNum(o.sizeUsd) / 1e6,
          isActive: o.isActive ?? true,
        };
      });

    return { positions, orders };
  } catch {
    return { positions: [], orders: [] };
  }
}

// ── Build: open position ──────────────────────────────────────────────────────

export async function buildOpenPositionTx(params: {
  ownerAddress: string;
  marketId: number;
  collateralUsd: number;
  leverage: number;
  slippageBps?: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const amountIn = new BN(Math.floor(params.collateralUsd * 10 ** colDec));
  const leverageBps = new BN(params.leverage * 10000);
  const q = await client.views.getOpenPositionQuoteEr(poolConfig, {
    market: market.marketAccount,
    targetSymbol: target?.symbol ?? "SOL",
    collateralSymbol: collateral?.symbol ?? "USDC",
    receivingSymbol: collateral?.symbol ?? "USDC",
    amountIn,
    leverage: leverageBps,
  });
  const slippage = (params.slippageBps ?? 100) / 10000;
  const sideIsLong = Object.keys(market.side)[0] === "long";
  const rawPrice = q.entryPrice ? Number(q.entryPrice) : 0;
  const priceWithSlippage = new BN(Math.floor(rawPrice * (sideIsLong ? 1 + slippage : 1 - slippage)));
  const owner = new PublicKey(params.ownerAddress);
  const { erProgram, oracleOf } = getAnyClient(client);
  const [initIx, delegateIx, ix] = await Promise.all([
    maybeInitBasketIx(client, owner),
    maybeDelegateBasketIx(client, owner),
    openPosition(
      erProgram, owner, poolConfig.poolAddress,
      market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
      await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
      priceWithSlippage, amountIn,
      q.sizeAmount ?? amountIn.mul(leverageBps).div(new BN(10000)),
      undefined, owner, undefined,
    ),
  ]);
  const setupIxs = [initIx, delegateIx].filter(Boolean);
  return buildTx(owner, setupIxs.length > 0 ? [...setupIxs, ix] : ix);
}

// ── Build: full close position ────────────────────────────────────────────────

export async function buildClosePositionTx(params: {
  ownerAddress: string;
  marketId: number;
  slippageBps?: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = await (client.views as any).getClosePositionQuoteEr(poolConfig, {
    owner, market: market.marketAccount,
    targetSymbol: target?.symbol ?? "SOL",
    collateralSymbol: collateral?.symbol ?? "USDC",
    dispensingSymbol: collateral?.symbol ?? "USDC",
    sizeDeltaUsd: new BN(0),
  });
  const slippage = (params.slippageBps ?? 100) / 10000;
  const sideIsLong = Object.keys(market.side)[0] === "long";
  const rawPrice = q.exitPrice ? Number(q.exitPrice) : 0;
  const priceWithSlippage = new BN(Math.floor(rawPrice * (sideIsLong ? 1 - slippage : 1 + slippage)));
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await closePosition(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
    priceWithSlippage, undefined, owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: partial close (decrease size) ─────────────────────────────────────

export async function buildPartialCloseTx(params: {
  ownerAddress: string;
  marketId: number;
  sizeDeltaUsd: number; // USD value of size to close
  slippageBps?: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const owner = new PublicKey(params.ownerAddress);
  const sizeDelta = new BN(Math.floor(params.sizeDeltaUsd * 1e6));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = await (client.views as any).getClosePositionQuoteEr(poolConfig, {
    owner, market: market.marketAccount,
    targetSymbol: target?.symbol ?? "SOL",
    collateralSymbol: collateral?.symbol ?? "USDC",
    dispensingSymbol: collateral?.symbol ?? "USDC",
    sizeDeltaUsd: sizeDelta,
  });
  const slippage = (params.slippageBps ?? 100) / 10000;
  const sideIsLong = Object.keys(market.side)[0] === "long";
  const rawPrice = q.exitPrice ? Number(q.exitPrice) : 0;
  const priceWithSlippage = new BN(Math.floor(rawPrice * (sideIsLong ? 1 - slippage : 1 + slippage)));
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await decreasePositionSize(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
    priceWithSlippage, sizeDelta,
    undefined, // privilege
    owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: add collateral ─────────────────────────────────────────────────────

export async function buildAddCollateralTx(params: {
  ownerAddress: string;
  marketId: number;
  collateralUsd: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const collateralDelta = new BN(Math.floor(params.collateralUsd * 10 ** colDec));
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await addCollateral(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
    collateralDelta, owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: remove collateral ──────────────────────────────────────────────────

export async function buildRemoveCollateralTx(params: {
  ownerAddress: string;
  marketId: number;
  collateralUsd: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const owner = new PublicKey(params.ownerAddress);
  const collateralDeltaUsd = new BN(Math.floor(params.collateralUsd * 1e6));
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await removeCollateral(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
    collateralDeltaUsd, owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: place limit order ──────────────────────────────────────────────────

export async function buildPlaceLimitOrderTx(params: {
  ownerAddress: string;
  marketId: number;
  limitPrice: number;       // USD price to trigger entry
  collateralUsd: number;
  leverage: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const reserveAmount = new BN(Math.floor(params.collateralUsd * 10 ** colDec));
  const leverageBps = new BN(params.leverage * 10000);
  const sizeAmount = reserveAmount.mul(leverageBps).div(new BN(10000));
  const limitPriceBn = new BN(Math.floor(params.limitPrice * 1e6));
  const tpPrice = params.takeProfitPrice != null ? new BN(Math.floor(params.takeProfitPrice * 1e6)) : new BN(0);
  const slPrice = params.stopLossPrice != null ? new BN(Math.floor(params.stopLossPrice * 1e6)) : new BN(0);
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await placeLimitOrder(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody,
    market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody),
    limitPriceBn, reserveAmount, sizeAmount,
    slPrice, tpPrice,
    owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: place TP/SL trigger order ─────────────────────────────────────────

export async function buildPlaceTriggerOrderTx(params: {
  ownerAddress: string;
  marketId: number;
  triggerPrice: number;
  deltaSizeUsd: number; // size delta to close on trigger
  isStopLoss: boolean;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const owner = new PublicKey(params.ownerAddress);
  const triggerPriceBn = new BN(Math.floor(params.triggerPrice * 1e6));
  const deltaSizeBn = new BN(Math.floor(params.deltaSizeUsd * 1e6));
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await placeTriggerOrder(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody),
    triggerPriceBn, deltaSizeBn, params.isStopLoss,
    owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: cancel limit order ─────────────────────────────────────────────────

export async function buildCancelLimitOrderTx(params: {
  ownerAddress: string;
  marketId: number;
  orderId: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const owner = new PublicKey(params.ownerAddress);
  const { erProgram } = getAnyClient(client);
  const ix = await cancelLimitOrder(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    new BN(params.orderId),
    owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: cancel trigger order ───────────────────────────────────────────────

export async function buildCancelTriggerOrderTx(params: {
  ownerAddress: string;
  marketId: number;
  orderId: number;
  isStopLoss: boolean;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const owner = new PublicKey(params.ownerAddress);
  const { erProgram } = getAnyClient(client);
  const ix = await cancelTriggerOrder(
    erProgram, owner,
    market.marketAccount,
    new BN(params.orderId),
    params.isStopLoss,
    owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Collateral change quotes ───────────────────────────────────────────────────

export async function getAddCollateralQuote(params: {
  ownerAddress: string;
  marketId: number;
  collateralUsd: number;
}) {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const collateralDelta = new BN(Math.floor(params.collateralUsd * 10 ** colDec));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (client.views as any).getAddCollateralQuoteEr(poolConfig, {
      owner, market: market.marketAccount,
      targetSymbol: target?.symbol ?? "SOL",
      collateralSymbol: collateral?.symbol ?? "USDC",
      receivingSymbol: collateral?.symbol ?? "USDC",
      amountIn: collateralDelta,
    });
    return {
      newLeverage: q.newLeverage ? Number(q.newLeverage) / 10000 : null,
      newLiqPrice: q.newLiquidationPrice ? Number(q.newLiquidationPrice) / 1e6 : null,
      fee: null,
      collateralSymbol: collateral?.symbol ?? "USDC",
    };
  } catch {
    return { newLeverage: null, newLiqPrice: null, fee: null, collateralSymbol: collateral?.symbol ?? "USDC" };
  }
}

export async function getRemoveCollateralQuote(params: {
  ownerAddress: string;
  marketId: number;
  collateralUsd: number;
}) {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const collateralDeltaUsd = new BN(Math.floor(params.collateralUsd * 1e6));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (client.views as any).getRemoveCollateralQuoteEr(poolConfig, {
      owner, market: market.marketAccount,
      targetSymbol: target?.symbol ?? "SOL",
      collateralSymbol: collateral?.symbol ?? "USDC",
      dispensingSymbol: collateral?.symbol ?? "USDC",
      collateralDeltaUsd,
    });
    return {
      newLeverage: q.newLeverage ? Number(q.newLeverage) / 10000 : null,
      newLiqPrice: q.newLiquidationPrice ? Number(q.newLiquidationPrice) / 1e6 : null,
      receiveAmount: q.receiveTokenAmount ? Number(q.receiveTokenAmount) / 10 ** colDec : null,
      fee: null,
      collateralSymbol: collateral?.symbol ?? "USDC",
    };
  } catch {
    return { newLeverage: null, newLiqPrice: null, receiveAmount: null, fee: null, collateralSymbol: collateral?.symbol ?? "USDC" };
  }
}

// ── Build: increase position size ─────────────────────────────────────────────

export async function buildIncreasePositionTx(params: {
  ownerAddress: string;
  marketId: number;
  addCollateralUsd: number;
  sizeDeltaUsd: number;
  slippageBps?: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const target = tokens[market.targetMint.toString()] ?? tokens[WSOL];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const deltaCollateral = new BN(Math.floor(params.addCollateralUsd * 10 ** colDec));
  const sizeDelta = new BN(Math.floor(params.sizeDeltaUsd * 1e6));
  const q = await client.views.getOpenPositionQuoteEr(poolConfig, {
    market: market.marketAccount,
    targetSymbol: target?.symbol ?? "SOL",
    collateralSymbol: collateral?.symbol ?? "USDC",
    receivingSymbol: collateral?.symbol ?? "USDC",
    amountIn: deltaCollateral,
    leverage: new BN(10000),
  });
  const slippage = (params.slippageBps ?? 100) / 10000;
  const sideIsLong = Object.keys(market.side)[0] === "long";
  const rawPrice = q.entryPrice ? Number(q.entryPrice) : 0;
  const priceWithSlippage = new BN(Math.floor(rawPrice * (sideIsLong ? 1 + slippage : 1 - slippage)));
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await increasePositionSize(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
    priceWithSlippage, sizeDelta, deltaCollateral,
    undefined, owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: edit limit order ───────────────────────────────────────────────────

export async function buildEditLimitOrderTx(params: {
  ownerAddress: string;
  marketId: number;
  orderId: number;
  newLimitPrice: number;
  newSizeUsd: number;
  newTakeProfitPrice?: number;
  newStopLossPrice?: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const tokens = buildTokenMap(poolConfig);
  const collateral = tokens[market.collateralMint.toString()];
  const colDec = collateral?.decimals ?? 6;
  const owner = new PublicKey(params.ownerAddress);
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await editLimitOrder(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody,
    market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody),
    new BN(params.orderId),
    new BN(Math.floor(params.newLimitPrice * 1e6)),
    new BN(Math.floor(params.newSizeUsd * 10 ** colDec)),
    params.newStopLossPrice != null ? new BN(Math.floor(params.newStopLossPrice * 1e6)) : new BN(0),
    params.newTakeProfitPrice != null ? new BN(Math.floor(params.newTakeProfitPrice * 1e6)) : new BN(0),
    owner, undefined,
  );
  return buildTx(owner, ix);
}

// ── Build: edit trigger order ─────────────────────────────────────────────────

export async function buildEditTriggerOrderTx(params: {
  ownerAddress: string;
  marketId: number;
  orderId: number;
  isStopLoss: boolean;
  newTriggerPrice: number;
  newDeltaSizeUsd: number;
}): Promise<string> {
  const { client, poolConfig } = getFlashClient();
  const market = poolConfig.markets[params.marketId];
  if (!market) throw new Error("Market not found");
  const owner = new PublicKey(params.ownerAddress);
  const { erProgram, oracleOf } = getAnyClient(client);
  const ix = await editTriggerOrder(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody),
    new BN(params.orderId),
    new BN(Math.floor(params.newTriggerPrice * 1e6)),
    new BN(Math.floor(params.newDeltaSizeUsd * 1e6)),
    params.isStopLoss,
    owner, undefined,
  );
  return buildTx(owner, ix);
}
