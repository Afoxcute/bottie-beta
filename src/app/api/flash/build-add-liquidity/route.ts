import { verifyAuth } from "@/lib/auth";
import { buildAddLiquidityTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; inSymbol: string; amountIn: number };
  if (!body.ownerAddress || !body.inSymbol || !body.amountIn)
    return new Response("ownerAddress, inSymbol, amountIn required", { status: 400 });
  try {
    const transaction = await buildAddLiquidityTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/build-add-liquidity]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
