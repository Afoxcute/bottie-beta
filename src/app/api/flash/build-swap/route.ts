import { verifyAuth } from "@/lib/auth";
import { buildSwapTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; inSymbol: string; outSymbol: string; amountIn: number };
  if (!body.ownerAddress || !body.inSymbol || !body.outSymbol || !body.amountIn)
    return new Response("ownerAddress, inSymbol, outSymbol, amountIn required", { status: 400 });
  try {
    const transaction = await buildSwapTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/build-swap]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
