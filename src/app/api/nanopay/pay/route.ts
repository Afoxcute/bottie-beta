import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getBuyerClient } from "@/lib/circle-gateway";

export async function POST(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { url } = await req.json().catch(() => ({ url: null }));
  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "url is required" },
      { status: 400 },
    );
  }

  try {
    const client = getBuyerClient();

    // Verify the target supports Gateway batching before paying.
    const support = await client.supports(url);
    if (!support.supported) {
      return NextResponse.json(
        { error: "Target URL does not support Circle Gateway nanopayments" },
        { status: 422 },
      );
    }

    const { data, status, amount, formattedAmount, transaction } =
      await client.pay(url);

    return NextResponse.json({
      status,
      data,
      paid: formattedAmount,
      transaction,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Payment failed" },
      { status: 500 },
    );
  }
}
