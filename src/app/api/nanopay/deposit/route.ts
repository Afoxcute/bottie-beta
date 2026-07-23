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

    const balances = await client.getBalances();
    const needed = BigInt(Math.round(Number(amount) * 1_000_000));

    if (balances.gateway.available >= needed) {
      return NextResponse.json({
        skipped: true,
        message: "Gateway balance already sufficient",
        gateway: {
          available: balances.gateway.formattedAvailable,
        },
      });
    }

    const result = await client.deposit(String(amount));
    return NextResponse.json({
      depositTxHash: result.depositTxHash,
      amount: result.formattedAmount,
      gateway: {
        available: (await client.getBalances()).gateway.formattedAvailable,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Deposit failed" },
      { status: 500 },
    );
  }
}
