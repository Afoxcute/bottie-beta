import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
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
  buildSwapEr,
  buildAddLiquidityAndStakeEr,
  buildRemoveLiquidityEr,
  buildCollectRebateEr,
  depositTokenStake,
  unstakeTokenRequest,
  collectTokenReward,
  createReferral,
  findBasketAddress,
  type BasketAccount,
} from "@flash_trade/flash-sdk-v2";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
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
      fee: q.fee ? Number(q.fee) / 10 ** colDec : null,
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
    return {
      exitPrice: q.exitPrice ? Number(q.exitPrice) / 1e6 : null,
      fee: q.fee ? Number(q.fee) / 10 ** colDec : null,
      pnl: q.pnl ? Number(q.pnl) / 10 ** colDec : null,
      receiveAmount: q.receiveAmount ? Number(q.receiveAmount) / 10 ** colDec : null,
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

export async function getUserPositions(walletAddress: string) {
  const { client } = getFlashClient();
  try {
    const ownerPk = new PublicKey(walletAddress);
    const basket: BasketAccount = await client.erAccounts!.fetchBasket(ownerPk);
    return {
      positions: (basket.positions ?? []).filter((p: unknown) => {
        const pos = p as { sizeAmount?: { toNumber?: () => number } };
        return (pos?.sizeAmount?.toNumber?.() ?? 0) > 0;
      }),
      orders: (basket.orders ?? []).filter((o: unknown) => {
        const ord = o as { sizeAmount?: { toNumber?: () => number }; isActive?: boolean };
        return ord?.isActive !== false && (ord?.sizeAmount?.toNumber?.() ?? 0) > 0;
      }),
    };
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
  const ix = await openPosition(
    erProgram, owner, poolConfig.poolAddress,
    market.marketAccount, market.targetCustody, market.collateralCustody, market.collateralCustody,
    await oracleOf(market.targetCustody), await oracleOf(market.collateralCustody), await oracleOf(market.collateralCustody),
    priceWithSlippage, amountIn,
    q.sizeAmount ?? amountIn.mul(leverageBps).div(new BN(10000)),
    undefined, owner, undefined,
  );
  return buildTx(owner, ix);
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
      collateralDelta,
    });
    return {
      newLeverage: q.newLeverage ? Number(q.newLeverage) / 10000 : null,
      newLiqPrice: q.newLiquidationPrice ? Number(q.newLiquidationPrice) / 1e6 : null,
      fee: q.fee ? Number(q.fee) / 10 ** colDec : null,
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
      collateralDeltaUsd,
    });
    return {
      newLeverage: q.newLeverage ? Number(q.newLeverage) / 10000 : null,
      newLiqPrice: q.newLiquidationPrice ? Number(q.newLiquidationPrice) / 1e6 : null,
      receiveAmount: q.receiveAmount ? Number(q.receiveAmount) / 10 ** colDec : null,
      fee: q.fee ? Number(q.fee) / 10 ** colDec : null,
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
