/**
 * Settles a completed on-chain transfer's receipt via Circle Gateway x402
 * nanopayments — called by the UI right after a bill/investment payment's
 * arcKit.send() confirms, so every checkout also exercises the real x402
 * pay-and-settle round trip against /api/nanopay/sell.
 */
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.CIRCLE_BUYER_PRIVATE_KEY) {
    return NextResponse.json({ usedNanopay: false, simulated: true });
  }

  try {
    const { getBuyerClient } = await import("@/lib/circle-gateway");
    const client = getBuyerClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const resourceUrl = `${base}/api/nanopay/sell`;

    const support = await client.supports(resourceUrl);
    if (!support.supported) {
      return NextResponse.json({ usedNanopay: false, simulated: true });
    }

    const result = await client.pay(resourceUrl);
    return NextResponse.json({
      usedNanopay: true,
      txHash: result?.transaction ?? null,
      paid: result?.formattedAmount ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({
      usedNanopay: false,
      simulated: true,
      error: err?.message ?? "Nanopay settlement unavailable",
    });
  }
}
