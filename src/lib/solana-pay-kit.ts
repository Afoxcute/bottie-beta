/**
 * Solana nanopayments via @solana/pay-kit (x402 / MPP protocol).
 *
 * The agent wallet is a dedicated Solana keypair stored in SOLANA_AGENT_PRIVATE_KEY
 * (base58-encoded 64-byte secret key — same format as Phantom's "export private key").
 * It is completely separate from the user's Privy Solana wallet.
 *
 * All operations run on Solana mainnet using the same RPC as Flash Trade.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOLANA_RPC =
  process.env.FLASH_SOLANA_RPC ||
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}` ||
  "https://api.mainnet-beta.solana.com";

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// ── Signer + client (cached per process) ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any | null = null;
let _address: string | null = null;

export async function getSolPayClient() {
  if (_client) return { client: _client, address: _address! };

  const secretKeyBase58 = process.env.SOLANA_AGENT_PRIVATE_KEY;
  if (!secretKeyBase58) throw new Error("SOLANA_AGENT_PRIVATE_KEY not configured");

  const { getBase58Decoder, createKeyPairSignerFromBytes } = await import("@solana/kit");
  const secretBytes = getBase58Decoder().decode(secretKeyBase58) as Uint8Array;
  const signer = await createKeyPairSignerFromBytes(secretBytes);

  const { createPayKitClient } = await import("@solana/pay-kit/client");
  _client = await createPayKitClient({ signer, rpcUrl: SOLANA_RPC });
  _address = signer.address as string;

  return { client: _client, address: _address };
}

// ── Balance ───────────────────────────────────────────────────────────────────

export async function getSolPayBalance(): Promise<{
  address: string;
  sol: number;
  usdc: number;
}> {
  const { address } = await getSolPayClient();
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const pubkey = new PublicKey(address);

  const [lamports, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { mint: USDC_MINT }),
  ]);

  const sol = lamports / LAMPORTS_PER_SOL;
  const usdcRaw = tokenAccounts.value[0]?.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0;

  return { address, sol, usdc: usdcRaw };
}

// ── Pay ───────────────────────────────────────────────────────────────────────

export async function solPayFetch(url: string): Promise<{
  status: number;
  data: unknown;
  paid: boolean;
}> {
  const { client } = await getSolPayClient();
  const res = await (client as { fetch: (url: string) => Promise<Response> }).fetch(url);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = await res.text().catch(() => null);
  }
  return { status: res.status, data, paid: res.status !== 402 };
}
