import { verifyAuth } from "@/lib/auth";
import { buildPlaceLimitOrderTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as {
    ownerAddress: string; marketId: number; limitPrice: number;
    collateralUsd: number; leverage: number;
    takeProfitPrice?: number; stopLossPrice?: number;
  };
  if (!body.ownerAddress || body.marketId == null || !body.limitPrice || !body.collateralUsd || !body.leverage)
    return new Response("ownerAddress, marketId, limitPrice, collateralUsd, leverage required", { status: 400 });
  try {
    const tx = await buildPlaceLimitOrderTx(body);
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/build-limit-order]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
