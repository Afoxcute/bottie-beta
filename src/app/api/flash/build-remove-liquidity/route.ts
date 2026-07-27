import { verifyAuth } from "@/lib/auth";
import { buildRemoveLiquidityTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; outSymbol: string; lpAmountIn: number };
  if (!body.ownerAddress || !body.outSymbol || !body.lpAmountIn)
    return new Response("ownerAddress, outSymbol, lpAmountIn required", { status: 400 });
  try {
    const transaction = await buildRemoveLiquidityTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/build-remove-liquidity]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
