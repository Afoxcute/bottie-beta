import { verifyAuth } from "@/lib/auth";
import { buildRemoveCompoundingLiquidityTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; outSymbol: string; sflpAmountIn: number };
  if (!body.ownerAddress || !body.outSymbol || !body.sflpAmountIn)
    return new Response("ownerAddress, outSymbol, sflpAmountIn required", { status: 400 });
  try {
    const transaction = await buildRemoveCompoundingLiquidityTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/build-remove-compounding]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
