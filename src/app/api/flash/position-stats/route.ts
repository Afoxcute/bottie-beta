import { verifyAuth } from "@/lib/auth";
import { getPositionStats } from "@/lib/flash";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const { searchParams } = new URL(req.url);
  const ownerAddress = searchParams.get("wallet") ?? "";
  const marketId = Number(searchParams.get("marketId"));
  if (!ownerAddress || isNaN(marketId)) return new Response("wallet and marketId required", { status: 400 });
  try {
    const stats = await getPositionStats({ ownerAddress, marketId });
    return Response.json(stats);
  } catch (err) {
    console.error("[flash/position-stats]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
