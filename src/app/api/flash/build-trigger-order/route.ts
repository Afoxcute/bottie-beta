import { verifyAuth } from "@/lib/auth";
import { buildPlaceTriggerOrderTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as {
    ownerAddress: string; marketId: number;
    triggerPrice: number; deltaSizeUsd: number; isStopLoss: boolean;
  };
  if (!body.ownerAddress || body.marketId == null || !body.triggerPrice || !body.deltaSizeUsd || body.isStopLoss == null)
    return new Response("ownerAddress, marketId, triggerPrice, deltaSizeUsd, isStopLoss required", { status: 400 });
  try {
    const tx = await buildPlaceTriggerOrderTx(body);
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/build-trigger-order]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
