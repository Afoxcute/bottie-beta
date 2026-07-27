import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const { url } = await req.json().catch(() => ({ url: null }));
  if (!url || typeof url !== "string")
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  try {
    const { solPayFetch } = await import("@/lib/solana-pay-kit");
    const result = await solPayFetch(url);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message ?? "Payment failed" }, { status: 500 });
  }
}
