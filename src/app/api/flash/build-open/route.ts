import { verifyAuth } from "@/lib/auth";
import { buildOpenPositionTx, getMarketsInfo } from "@/lib/flash";

function resolveMarketId(body: Record<string, unknown>): number {
  if (body.marketId != null) return Number(body.marketId);
  if (body.market && body.side) {
    const markets = getMarketsInfo();
    const symbol = String(body.market).toUpperCase();
    const side = String(body.side).toLowerCase();
    const m = markets.find(mk => mk.symbol.toUpperCase() === symbol && mk.side === side);
    if (m) return m.marketId;
  }
  throw new Error(`Cannot resolve market — pass marketId or market+side`);
}

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as Record<string, unknown>;
  if (!body.ownerAddress || !body.collateralUsd || !body.leverage)
    return new Response("ownerAddress, collateralUsd, leverage required", { status: 400 });
  try {
    const marketId = resolveMarketId(body);
    const tx = await buildOpenPositionTx({
      ownerAddress: String(body.ownerAddress),
      marketId,
      collateralUsd: Number(body.collateralUsd),
      leverage: Number(body.leverage),
      slippageBps: body.slippageBps != null ? Number(body.slippageBps) : undefined,
    });
    return Response.json({ transaction: tx });
  } catch (err: unknown) {
    console.error("[flash/build-open]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
