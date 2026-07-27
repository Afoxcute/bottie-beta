// Extra Flash SDK integrations: Swap, FLP Liquidity, Staking, Rebates, Referral
// Kept separate from flash.ts (perpetuals) to stay manageable.

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  PoolConfig,
  PROGRAM_ID,
  PERPETUALS_PROGRAM_ID,
  SESSION_KEYS_PROGRAM_ID,
  initializeUserDepositLedger,
  createSession,
  revokeSession,
  buildSwapWithAction,
  buildAddLiquidityAndStakeWithAction,
  buildRemoveLiquidityWithAction,
  buildDepositTokenStakeWithAction,
  unstakeTokenRequest,
  cancelUnstakeTokenRequest,
  buildWithdrawTokenWithAction,
  buildCollectTokenRewardWithAction,
  buildCollectStakeRewardWithAction,
  buildCollectRebateWithAction,
  buildAddCompoundingLiquidityWithAction,
  buildRemoveCompoundingLiquidityWithAction,
  buildMigrateFlpWithAction,
  buildMigrateStakeWithAction,
  buildCollectRevenueWithAction,
  cancelAllTriggerOrders,
  depositDirect,
  withdrawalWithAction,
  createReferral,
  FlashPerpetualsClient,
} from "@flash_trade/flash-sdk-v2";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

const SOL_RPC =
  process.env.FLASH_SOLANA_RPC ||
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}` ||
  "https://api.mainnet-beta.solana.com";

const ER_RPC = process.env.FLASH_ER_RPC || "https://flash.magicblock.xyz";
const FLASH_CLUSTER = "mainnet-beta" as const;

let _client: FlashPerpetualsClient | null = null;
let _poolConfig: PoolConfig | null = null;

function getClient() {
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
  const client = new FlashPerpetualsClient(provider, undefined, PROGRAM_ID[FLASH_CLUSTER], { prioritizationFee: 5000 }, ER_RPC);
  _client = client;
  _poolConfig = pc;
  return { client, poolConfig: pc };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProgram(client: FlashPerpetualsClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  return c.program ?? c.erProgram ?? c.getErProgram?.();
}

async function getAta(owner: PublicKey, mint: PublicKey) {
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  const createIx = createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint);
  return { ata, createIx };
}

async function finalizeTx(owner: PublicKey, ixs: import("@solana/web3.js").TransactionInstruction[]): Promise<string> {
  const connection = new Connection(SOL_RPC, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner });
  tx.add(...ixs);
  return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
}

function extractIxs(result: { instructions: import("@solana/web3.js").TransactionInstruction[] }) {
  return result.instructions;
}

async function maybeInitDepositLedgerIx(client: FlashPerpetualsClient, owner: PublicKey) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(client);
  const connection = new Connection(SOL_RPC, "confirmed");
  const [ledgerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit_ledger"), owner.toBuffer()],
    program.programId,
  );
  const info = await connection.getAccountInfo(ledgerPda);
  if (info) return null;
  return initializeUserDepositLedger(program, owner);
}

// ── Token list ────────────────────────────────────────────────────────────────

export function getAvailableTokens() {
  const { poolConfig } = getClient();
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (poolConfig.tokens as any[])
    .filter((t) => { if (seen.has(t.symbol)) return false; seen.add(t.symbol); return true; })
    .map((t) => ({ symbol: t.symbol as string, mint: (t.mintKey as PublicKey).toString(), decimals: t.decimals as number }));
}

// ── Swap ──────────────────────────────────────────────────────────────────────

export type SwapQuote = { amountOut: number | null; fee: number | null; inSymbol: string; outSymbol: string };

export async function getSwapQuote(params: { inSymbol: string; outSymbol: string; amountIn: number }): Promise<SwapQuote> {
  const { client, poolConfig } = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.inSymbol);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.outSymbol);
  if (!inTok || !outTok) throw new Error("Token not found");
  const amountInBn = new BN(Math.floor(params.amountIn * 10 ** inTok.decimals));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (client.views as any).getSwapAmountAndFees(poolConfig, {
      receivingSymbol: params.inSymbol, dispensingSymbol: params.outSymbol, amountIn: amountInBn,
    });
    return {
      amountOut: q.amountOut ? Number(q.amountOut) / 10 ** outTok.decimals : null,
      fee: q.feeOut ? Number(q.feeOut) / 10 ** outTok.decimals : null,
      inSymbol: params.inSymbol, outSymbol: params.outSymbol,
    };
  } catch { return { amountOut: null, fee: null, inSymbol: params.inSymbol, outSymbol: params.outSymbol }; }
}

export async function buildSwapTx(params: { ownerAddress: string; inSymbol: string; outSymbol: string; amountIn: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.inSymbol);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.outSymbol);
  if (!inTok || !outTok) throw new Error("Token not found");
  const amountIn = new BN(Math.floor(params.amountIn * 10 ** inTok.decimals));
  const { ata: inAta, createIx: inIx } = await getAta(owner, inTok.mintKey as PublicKey);
  const { ata: outAta, createIx: outIx } = await getAta(owner, outTok.mintKey as PublicKey);
  const result = await buildSwapWithAction(getProgram(client), poolConfig, {
    owner, inSymbol: params.inSymbol, outSymbol: params.outSymbol,
    amountIn, inAccount: inAta, outAccount: outAta, minAmountOut: new BN(0),
  });
  return finalizeTx(owner, [inIx, outIx, ...extractIxs(result)]);
}

// ── FLP Liquidity ─────────────────────────────────────────────────────────────

export type LiquidityQuote = { lpAmount: number | null; fee: number | null; lpPrice: number | null; symbol: string };

export async function getAddLiquidityQuote(params: { inSymbol: string; amountIn: number }): Promise<LiquidityQuote> {
  const { client, poolConfig } = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.inSymbol);
  if (!inTok) throw new Error("Token not found");
  const amountInBn = new BN(Math.floor(params.amountIn * 10 ** inTok.decimals));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const views = client.views as any;
    const [q, lpPrice] = await Promise.allSettled([
      views.getAddLiquidityAmountAndFee(poolConfig, { symbol: params.inSymbol, amountIn: amountInBn }),
      views.getLpTokenPrice(poolConfig),
    ]);
    return {
      lpAmount: q.status === "fulfilled" && q.value?.amount ? Number(q.value.amount) / 1e9 : null,
      fee: q.status === "fulfilled" && q.value?.fee ? Number(q.value.fee) / 10 ** inTok.decimals : null,
      lpPrice: lpPrice.status === "fulfilled" && lpPrice.value ? Number(lpPrice.value) / 1e6 : null,
      symbol: params.inSymbol,
    };
  } catch { return { lpAmount: null, fee: null, lpPrice: null, symbol: params.inSymbol }; }
}

export async function getRemoveLiquidityQuote(params: { outSymbol: string; lpAmountIn: number }): Promise<{ amountOut: number | null; fee: number | null; symbol: string }> {
  const { client, poolConfig } = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.outSymbol);
  if (!outTok) throw new Error("Token not found");
  const lpAmountBn = new BN(Math.floor(params.lpAmountIn * 1e9));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (client.views as any).getRemoveLiquidityAmountAndFee(poolConfig, { symbol: params.outSymbol, lpAmountIn: lpAmountBn });
    return {
      amountOut: q.amount ? Number(q.amount) / 10 ** outTok.decimals : null,
      fee: q.fee ? Number(q.fee) / 10 ** outTok.decimals : null,
      symbol: params.outSymbol,
    };
  } catch { return { amountOut: null, fee: null, symbol: params.outSymbol }; }
}

export async function buildAddLiquidityTx(params: { ownerAddress: string; inSymbol: string; amountIn: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.inSymbol);
  if (!inTok) throw new Error("Token not found");
  const amountIn = new BN(Math.floor(params.amountIn * 10 ** inTok.decimals));
  const { ata: fundingAta, createIx } = await getAta(owner, inTok.mintKey as PublicKey);
  const result = await buildAddLiquidityAndStakeWithAction(getProgram(client), poolConfig, {
    owner, inSymbol: params.inSymbol, amountIn, fundingAccount: fundingAta, minLpAmountOut: new BN(0),
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

export async function buildRemoveLiquidityTx(params: { ownerAddress: string; outSymbol: string; lpAmountIn: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.outSymbol);
  if (!outTok) throw new Error("Token not found");
  const unstakeAmount = new BN(Math.floor(params.lpAmountIn * 1e9));
  const { ata: receivingAta, createIx } = await getAta(owner, outTok.mintKey as PublicKey);
  const result = await buildRemoveLiquidityWithAction(getProgram(client), poolConfig, {
    owner, outSymbol: params.outSymbol, unstakeAmount, receivingAccount: receivingAta, minAmountOut: new BN(0),
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── FLASH Token Staking ───────────────────────────────────────────────────────

const FLASH_MINT = new PublicKey("FAFxVxnkzZHMCodkWyoccgUNgVScqMw2mhhQBYDFjFAF");

export async function buildStakeFlashTx(params: { ownerAddress: string; amount: number }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const depositAmount = new BN(Math.floor(params.amount * 1e6));
  const { ata: fundingAta, createIx } = await getAta(owner, FLASH_MINT);
  const result = await buildDepositTokenStakeWithAction(getProgram(client), {
    tokenMint: FLASH_MINT, fundingAccount: fundingAta, depositAmount, owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

export async function buildUnstakeFlashTx(params: { ownerAddress: string; amount: number }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const unstakeAmount = new BN(Math.floor(params.amount * 1e6));
  const ix = await unstakeTokenRequest(getProgram(client), unstakeAmount, owner);
  return finalizeTx(owner, [ix]);
}

export async function buildCollectStakeRewardTx(params: { ownerAddress: string }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const { ata: receivingAta, createIx } = await getAta(owner, FLASH_MINT);
  const result = await buildCollectTokenRewardWithAction(getProgram(client), {
    tokenMint: FLASH_MINT, receivingTokenAccount: receivingAta, owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── Collect Rebates ───────────────────────────────────────────────────────────

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function buildCollectRebateTx(params: { ownerAddress: string }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const { ata: receivingAta, createIx } = await getAta(owner, USDC_MINT);
  const result = await buildCollectRebateWithAction(getProgram(client), {
    rebateTokenMint: USDC_MINT, receivingTokenAccount: receivingAta, owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── Cancel unstake + withdraw (complete the FLASH staking cycle) ──────────────

export async function buildCancelUnstakeTx(params: { ownerAddress: string; withdrawRequestId: number }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const ix = await cancelUnstakeTokenRequest(getProgram(client), params.withdrawRequestId, owner);
  return finalizeTx(owner, [ix]);
}

export async function buildWithdrawFlashTx(params: { ownerAddress: string; withdrawRequestId: number }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const { ata: receivingAta, createIx } = await getAta(owner, FLASH_MINT);
  const result = await buildWithdrawTokenWithAction(getProgram(client), {
    tokenMint: FLASH_MINT, receivingTokenAccount: receivingAta,
    withdrawRequestId: params.withdrawRequestId, owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── FLP staking rewards (separate from FLASH token rewards) ──────────────────

export async function buildCollectFlpRewardTx(params: { ownerAddress: string; rewardSymbol?: string }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const rewardSymbol = params.rewardSymbol ?? "USDC";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rewardTok = (poolConfig.tokens as any[]).find(t => t.symbol === rewardSymbol);
  if (!rewardTok) throw new Error("Reward token not found");
  const { ata: receivingAta, createIx } = await getAta(owner, rewardTok.mintKey as PublicKey);
  const result = await buildCollectStakeRewardWithAction(getProgram(client), poolConfig, {
    receivingTokenAccount: receivingAta, owner, rewardSymbol,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── sFLP Compounding Liquidity ────────────────────────────────────────────────

export async function buildAddCompoundingLiquidityTx(params: { ownerAddress: string; inSymbol: string; amountIn: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.inSymbol);
  if (!inTok) throw new Error("Token not found");
  const amountIn = new BN(Math.floor(params.amountIn * 10 ** inTok.decimals));
  const sflpMint: PublicKey = poolConfig.compoundingTokenMint;
  const { ata: fundingAta, createIx: fundIx } = await getAta(owner, inTok.mintKey as PublicKey);
  const { ata: sflpAta, createIx: sflpIx } = await getAta(owner, sflpMint);
  const result = await buildAddCompoundingLiquidityWithAction(getProgram(client), poolConfig, {
    owner, inSymbol: params.inSymbol, amountIn, fundingAccount: fundingAta,
    compoundingTokenAccount: sflpAta, minCompoundingAmountOut: new BN(0),
  });
  return finalizeTx(owner, [fundIx, sflpIx, ...extractIxs(result)]);
}

export async function buildRemoveCompoundingLiquidityTx(params: { ownerAddress: string; outSymbol: string; sflpAmountIn: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.outSymbol);
  if (!outTok) throw new Error("Token not found");
  const compoundingAmountIn = new BN(Math.floor(params.sflpAmountIn * 1e9));
  const sflpMint: PublicKey = poolConfig.compoundingTokenMint;
  const { ata: receivingAta, createIx: recIx } = await getAta(owner, outTok.mintKey as PublicKey);
  const { ata: sflpAta, createIx: sflpIx } = await getAta(owner, sflpMint);
  const result = await buildRemoveCompoundingLiquidityWithAction(getProgram(client), poolConfig, {
    owner, outSymbol: params.outSymbol, compoundingAmountIn, receivingAccount: receivingAta,
    compoundingTokenAccount: sflpAta, minAmountOut: new BN(0),
  });
  return finalizeTx(owner, [recIx, sflpIx, ...extractIxs(result)]);
}

// ── sFLP Compounding Quotes ───────────────────────────────────────────────────

export type CompoundingQuote = { sflpAmount: number | null; fee: number | null; sflpPrice: number | null; symbol: string };

export async function getAddCompoundingQuote(params: { inSymbol: string; amountIn: number }): Promise<CompoundingQuote> {
  const { client, poolConfig } = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.inSymbol);
  if (!inTok) throw new Error("Token not found");
  const amountInBn = new BN(Math.floor(params.amountIn * 10 ** inTok.decimals));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const views = client.views as any;
    const [q, price] = await Promise.allSettled([
      views.getAddCompoundingLiquidityAmountAndFee(poolConfig, { inSymbol: params.inSymbol, amountIn: amountInBn }),
      views.getCompoundingTokenPrice(poolConfig),
    ]);
    return {
      sflpAmount: q.status === "fulfilled" && q.value?.amount ? Number(q.value.amount) / 1e9 : null,
      fee: q.status === "fulfilled" && q.value?.fee ? Number(q.value.fee) / 10 ** inTok.decimals : null,
      sflpPrice: price.status === "fulfilled" && price.value ? Number(price.value) / 1e6 : null,
      symbol: params.inSymbol,
    };
  } catch { return { sflpAmount: null, fee: null, sflpPrice: null, symbol: params.inSymbol }; }
}

export async function getRemoveCompoundingQuote(params: { outSymbol: string; sflpAmountIn: number }): Promise<{ amountOut: number | null; fee: number | null; symbol: string }> {
  const { client, poolConfig } = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outTok = (poolConfig.tokens as any[]).find(t => t.symbol === params.outSymbol);
  if (!outTok) throw new Error("Token not found");
  const compoundingAmountIn = new BN(Math.floor(params.sflpAmountIn * 1e9));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await (client.views as any).getRemoveCompoundingLiquidityAmountAndFee(poolConfig, { outSymbol: params.outSymbol, compoundingAmountIn });
    return {
      amountOut: q.amount ? Number(q.amount) / 10 ** outTok.decimals : null,
      fee: q.fee ? Number(q.fee) / 10 ** outTok.decimals : null,
      symbol: params.outSymbol,
    };
  } catch { return { amountOut: null, fee: null, symbol: params.outSymbol }; }
}

// ── Trade Vault Deposit / Withdrawal ─────────────────────────────────────────

export async function buildDepositDirectTx(params: { ownerAddress: string; tokenSymbol: string; amount: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tok = (poolConfig.tokens as any[]).find(t => t.symbol === params.tokenSymbol);
  if (!tok) throw new Error("Token not found");
  const amount = new BN(Math.floor(params.amount * 10 ** tok.decimals));
  const { ata: depositorAta, createIx } = await getAta(owner, tok.mintKey as PublicKey);
  const [ledgerIx, ix] = await Promise.all([
    maybeInitDepositLedgerIx(client, owner),
    depositDirect(getProgram(client), owner, tok.mintKey as PublicKey, depositorAta, amount),
  ]);
  return finalizeTx(owner, [createIx, ...(ledgerIx ? [ledgerIx] : []), ix]);
}

export async function buildWithdrawalTx(params: { ownerAddress: string; tokenSymbol: string; amount: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tok = (poolConfig.tokens as any[]).find(t => t.symbol === params.tokenSymbol);
  if (!tok) throw new Error("Token not found");
  const amount = new BN(Math.floor(params.amount * 10 ** tok.decimals));
  const { ata: ownerAta, createIx } = await getAta(owner, tok.mintKey as PublicKey);
  const ix = await withdrawalWithAction(getProgram(client), owner, tok.mintKey as PublicKey, ownerAta, amount);
  return finalizeTx(owner, [createIx, ix]);
}

// ── Referral ──────────────────────────────────────────────────────────────────

export async function buildCreateReferralTx(params: { ownerAddress: string; referrerAddress: string }): Promise<string> {
  const { client } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const referrer = new PublicKey(params.referrerAddress);
  const ix = await createReferral(getProgram(client), referrer, { owner });
  return finalizeTx(owner, [ix]);
}

// ── Collect Revenue (referrer protocol revenue) ───────────────────────────────

export async function buildCollectRevenueTx(params: { ownerAddress: string; revenueTokenSymbol?: string }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const program = getProgram(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = poolConfig.tokens as any[];
  const symbol = params.revenueTokenSymbol ?? "USDC";
  const tok = tokens.find(t => t.symbol === symbol);
  if (!tok) throw new Error(`Token ${symbol} not found`);
  const { ata: receivingAta, createIx } = await getAta(owner, tok.mintKey as PublicKey);
  const result = await buildCollectRevenueWithAction(program, {
    revenueTokenMint: tok.mintKey as PublicKey,
    receivingRevenueAccount: receivingAta,
    owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── Migrate FLP ↔ sFLP ────────────────────────────────────────────────────────

export async function buildMigrateFlpTx(params: { ownerAddress: string; sflpAmount: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const program = getProgram(client);
  const compoundingMint = (poolConfig as any).compoundingTokenMint as PublicKey;
  const { ata: compoundingAta, createIx } = await getAta(owner, compoundingMint);
  const amount = new BN(Math.floor(params.sflpAmount * 1e6));
  const result = await buildMigrateFlpWithAction(program, poolConfig, {
    compoundingTokenAccount: compoundingAta,
    compoundingTokenAmount: amount,
    owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

export async function buildMigrateStakeTx(params: { ownerAddress: string; flpAmount: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const program = getProgram(client);
  const compoundingMint = (poolConfig as any).compoundingTokenMint as PublicKey;
  const { ata: compoundingAta, createIx } = await getAta(owner, compoundingMint);
  const amount = new BN(Math.floor(params.flpAmount * 1e6));
  const result = await buildMigrateStakeWithAction(program, poolConfig, {
    compoundingTokenAccount: compoundingAta,
    amount,
    owner,
  });
  return finalizeTx(owner, [createIx, ...extractIxs(result)]);
}

// ── Cancel All Triggers ───────────────────────────────────────────────────────

export async function buildCancelAllTriggersTx(params: { ownerAddress: string; marketId: number }): Promise<string> {
  const { client, poolConfig } = getClient();
  const owner = new PublicKey(params.ownerAddress);
  const program = getProgram(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markets = (poolConfig as any).markets as any[];
  const market = markets.find((_: any, i: number) => i === params.marketId) ?? markets[params.marketId];
  if (!market) throw new Error(`Market ${params.marketId} not found`);
  const marketPk = market.marketAccount ?? market.publicKey ?? market;
  const ix = await cancelAllTriggerOrders(program, owner, marketPk as PublicKey);
  return finalizeTx(owner, [ix]);
}

// ── Session Keys ──────────────────────────────────────────────────────────────

/**
 * Builds a create_session_v2 transaction.
 * The transaction must be signed by BOTH the owner wallet (Privy) AND the
 * session keypair. The session keypair is generated client-side and its
 * public key is passed here. The secret key is stored in the browser.
 */
export async function buildCreateSessionTx(params: {
  ownerAddress: string;
  sessionSignerPubkey: string;
  durationHours: number;
}): Promise<string> {
  const owner = new PublicKey(params.ownerAddress);
  const sessionSigner = new PublicKey(params.sessionSignerPubkey);
  const validUntilMs = Date.now() + params.durationHours * 60 * 60 * 1000;
  const validUntil = new (await import("@coral-xyz/anchor")).BN(Math.floor(validUntilMs / 1000));
  const ix = createSession(owner, sessionSigner, PERPETUALS_PROGRAM_ID, false, validUntil);
  return finalizeTx(owner, [ix]);
}

export async function buildRevokeSessionTx(params: {
  ownerAddress: string;
  sessionSignerPubkey: string;
}): Promise<string> {
  const owner = new PublicKey(params.ownerAddress);
  const sessionSigner = new PublicKey(params.sessionSignerPubkey);
  const ix = revokeSession(owner, sessionSigner, PERPETUALS_PROGRAM_ID);
  return finalizeTx(owner, [ix]);
}
