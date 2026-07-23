import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getBuyerClient } from "@/lib/circle-gateway";

export async function POST(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { amount } = await req.json().catch(() => ({ amount: null }));
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  try {
    const client = getBuyerClient();
    const result = await client.withdraw(String(amount));
    return NextResponse.json({
      mintTxHash: result.mintTxHash,
      amount: result.formattedAmount,
      chain: result.destinationChain,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Withdrawal failed" },
      { status: 500 },
    );
  }
}
