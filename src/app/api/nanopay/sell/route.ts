/**
 * Example x402-protected seller endpoint using Circle Gateway nanopayments.
 *
 * GET /api/nanopay/sell
 *   - Without PAYMENT-SIGNATURE: returns 402 with PAYMENT-REQUIRED header
 *   - With valid PAYMENT-SIGNATURE: settles the payment and returns premium content
 *
 * Price: $0.01 USDC (10_000 base units)
 */

import {
  buildPaymentRequirements,
  settlePayment,
} from "@/lib/circle-gateway";

const PRICE_USD = 0.01; // $0.01

function getSellerAddress(): string {
  const addr = process.env.CIRCLE_SELLER_ADDRESS;
  if (!addr) throw new Error("CIRCLE_SELLER_ADDRESS is not configured");
  return addr;
}

export async function GET(req: Request) {
  const resourceUrl = new URL(req.url).toString();
  const paymentSignature = req.headers.get("payment-signature");

  let requirements: Record<string, unknown>;
  let paymentRequired: Record<string, unknown>;

  try {
    ({ requirements, paymentRequired } = await buildPaymentRequirements(
      PRICE_USD,
      getSellerAddress(),
      resourceUrl,
    ));
  } catch (err: any) {
    return Response.json(
      { error: "Seller configuration error: " + (err?.message ?? "unknown") },
      { status: 500 },
    );
  }

  // No payment header — return 402 with payment requirements
  if (!paymentSignature) {
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
      "base64",
    );
    return new Response(JSON.stringify({ error: "Payment required" }), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": encoded,
      },
    });
  }

  // Settle the payment via Circle Gateway
  const settlement = await settlePayment(paymentSignature, requirements);

  if (!settlement.success) {
    return Response.json(
      {
        error: "Payment settlement failed",
        reason: settlement.errorReason,
      },
      { status: 402 },
    );
  }

  // Payment confirmed — serve premium content
  return Response.json(
    {
      content: "Payment receipt confirmed via Circle Gateway nanopayments",
      paidBy: settlement.payer,
      transaction: settlement.transaction,
      priceUSDC: PRICE_USD,
      chain: "Base Sepolia",
    },
    {
      headers: {
        "PAYMENT-RESPONSE": Buffer.from(
          JSON.stringify({ success: true, transaction: settlement.transaction }),
        ).toString("base64"),
      },
    },
  );
}
