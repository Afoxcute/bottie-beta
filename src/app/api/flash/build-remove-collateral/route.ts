import { verifyAuth } from "@/lib/auth";
import { buildRemoveCollateralTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as Record<string, unknown>;
  // Accept both `collateralUsd` (route default) and `amountUsd` (AI tool field)
  const collateralUsd = Number(body.collateralUsd ?? body.amountUsd);
  if (!body.ownerAddress || body.marketId == null || !collateralUsd)
    return new Response("ownerAddress, marketId, collateralUsd (or amountUsd) required", { status: 400 });
  try {
    const tx = await buildRemoveCollateralTx({
      ownerAddress: String(body.ownerAddress),
      marketId: Number(body.marketId),
      collateralUsd,
    });
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/build-remove-collateral]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
