import { verifyAuth } from "@/lib/auth";
import { buildClosePositionTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; marketId: number; slippageBps?: number };
  if (!body.ownerAddress || body.marketId == null)
    return new Response("ownerAddress and marketId required", { status: 400 });
  try {
    const tx = await buildClosePositionTx(body);
    return Response.json({ transaction: tx });
  } catch (err: unknown) {
    console.error("[flash/build-close]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
