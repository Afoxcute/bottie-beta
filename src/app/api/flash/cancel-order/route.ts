import { verifyAuth } from "@/lib/auth";
import { buildCancelLimitOrderTx, buildCancelTriggerOrderTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as {
    ownerAddress: string; marketId: number; orderId: number;
    orderType: "limit" | "trigger"; isStopLoss?: boolean;
  };
  if (!body.ownerAddress || body.marketId == null || body.orderId == null || !body.orderType)
    return new Response("ownerAddress, marketId, orderId, orderType required", { status: 400 });
  try {
    const tx = body.orderType === "limit"
      ? await buildCancelLimitOrderTx({ ownerAddress: body.ownerAddress, marketId: body.marketId, orderId: body.orderId })
      : await buildCancelTriggerOrderTx({ ownerAddress: body.ownerAddress, marketId: body.marketId, orderId: body.orderId, isStopLoss: body.isStopLoss ?? false });
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/cancel-order]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
