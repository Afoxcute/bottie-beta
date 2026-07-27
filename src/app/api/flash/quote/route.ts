import { verifyAuth } from "@/lib/auth";
import { getOpenQuote } from "@/lib/flash";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const p = new URL(req.url).searchParams;
  const marketId   = Number(p.get("marketId") ?? "0");
  const collateral = Number(p.get("collateral") ?? "10");
  const leverage   = Number(p.get("leverage") ?? "2");
  try {
    const quote = await getOpenQuote({ marketId, collateralUsd: collateral, leverage });
    return Response.json(quote);
  } catch (err: unknown) {
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
