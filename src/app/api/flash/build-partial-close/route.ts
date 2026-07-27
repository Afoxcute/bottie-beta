import { verifyAuth } from "@/lib/auth";
import { buildPartialCloseTx, getUserPositions, getMarketsInfo } from "@/lib/flash";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as Record<string, unknown>;
  if (!body.ownerAddress || body.marketId == null)
    return new Response("ownerAddress, marketId required", { status: 400 });

  let sizeDeltaUsd = body.sizeDeltaUsd != null ? Number(body.sizeDeltaUsd) : undefined;

  // Resolve closePercent → sizeDeltaUsd by fetching the live position
  if (sizeDeltaUsd == null && body.closePercent != null) {
    const pct = Math.max(1, Math.min(99, Number(body.closePercent)));
    try {
      const { positions } = await getUserPositions(String(body.ownerAddress));
      const markets = getMarketsInfo();
      const market = markets.find(m => m.marketId === Number(body.marketId));
      if (!market) return new Response("Market not found", { status: 400 });
      const pos = positions.find(
        p => p.marketAccount === market.marketAccount && p.isActive !== false
      );
      if (!pos) return new Response("No open position found for this market", { status: 404 });
      // pos.sizeUsd is already in human USD (divided by 1e6 in getUserPositions)
      sizeDeltaUsd = (pos.sizeUsd * pct) / 100;
    } catch (err) {
      console.error("[flash/build-partial-close] position lookup failed:", err);
      return new Response("Failed to resolve position size from closePercent", { status: 500 });
    }
  }

  if (!sizeDeltaUsd) return new Response("sizeDeltaUsd or closePercent required", { status: 400 });

  try {
    const tx = await buildPartialCloseTx({
      ownerAddress: String(body.ownerAddress),
      marketId: Number(body.marketId),
      sizeDeltaUsd,
      slippageBps: body.slippageBps != null ? Number(body.slippageBps) : undefined,
    });
    return Response.json({ transaction: tx });
  } catch (err) {
    console.error("[flash/build-partial-close]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
