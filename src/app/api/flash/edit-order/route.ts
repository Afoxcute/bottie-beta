import { verifyAuth } from "@/lib/auth";
import { buildEditLimitOrderTx, buildEditTriggerOrderTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as {
    ownerAddress: string; marketId: number; orderId: number;
    orderType: "limit" | "trigger";
    // limit fields
    newLimitPrice?: number; newSizeUsd?: number;
    newTakeProfitPrice?: number; newStopLossPrice?: number;
    // trigger fields
    isStopLoss?: boolean; newTriggerPrice?: number; newDeltaSizeUsd?: number;
  };
  if (!body.ownerAddress || body.marketId == null || body.orderId == null || !body.orderType)
    return new Response("ownerAddress, marketId, orderId, orderType required", { status: 400 });
  try {
    let tx: string;
    if (body.orderType === "limit") {
      if (!body.newLimitPrice || !body.newSizeUsd)
        return new Response("newLimitPrice and newSizeUsd required for limit orders", { status: 400 });
      tx = await buildEditLimitOrderTx({
        ownerAddress: body.ownerAddress, marketId: body.marketId, orderId: body.orderId,
        newLimitPrice: body.newLimitPrice, newSizeUsd: body.newSizeUsd,
        newTakeProfitPrice: body.newTakeProfitPrice, newStopLossPrice: body.newStopLossPrice,
      });
    } else {
      if (!body.newTriggerPrice || !body.newDeltaSizeUsd || body.isStopLoss == null)
        return new Response("newTriggerPrice, newDeltaSizeUsd, isStopLoss required for trigger orders", { status: 400 });
      tx = await buildEditTriggerOrderTx({
        ownerAddress: body.ownerAddress, marketId: body.marketId, orderId: body.orderId,
        isStopLoss: body.isStopLoss, newTriggerPrice: body.newTriggerPrice, newDeltaSizeUsd: body.newDeltaSizeUsd,
      });
    }
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/edit-order]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
