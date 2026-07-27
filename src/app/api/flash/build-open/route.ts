import { verifyAuth } from "@/lib/auth";
import { buildOpenPositionTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; marketId: number; collateralUsd: number; leverage: number; slippageBps?: number };
  if (!body.ownerAddress || body.marketId == null || !body.collateralUsd || !body.leverage)
    return new Response("ownerAddress, marketId, collateralUsd, leverage required", { status: 400 });
  try {
    const tx = await buildOpenPositionTx(body);
    return Response.json({ transaction: tx });
  } catch (err: unknown) {
    console.error("[flash/build-open]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
