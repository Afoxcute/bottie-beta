import { verifyAuth } from "@/lib/auth";
import { buildAddCollateralTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; marketId: number; collateralUsd: number };
  if (!body.ownerAddress || body.marketId == null || !body.collateralUsd)
    return new Response("ownerAddress, marketId, collateralUsd required", { status: 400 });
  try {
    const tx = await buildAddCollateralTx(body);
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/build-add-collateral]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
