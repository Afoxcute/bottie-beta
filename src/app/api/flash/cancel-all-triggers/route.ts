import { verifyAuth } from "@/lib/auth";
import { buildCancelAllTriggersTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; marketId: number };
  if (!body.ownerAddress || body.marketId === undefined) return new Response("ownerAddress, marketId required", { status: 400 });
  try {
    const transaction = await buildCancelAllTriggersTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/cancel-all-triggers]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
