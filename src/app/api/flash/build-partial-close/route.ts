import { verifyAuth } from "@/lib/auth";
import { buildPartialCloseTx } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; marketId: number; sizeDeltaUsd: number; slippageBps?: number };
  if (!body.ownerAddress || body.marketId == null || !body.sizeDeltaUsd)
    return new Response("ownerAddress, marketId, sizeDeltaUsd required", { status: 400 });
  try {
    const tx = await buildPartialCloseTx(body);
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/build-partial-close]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
