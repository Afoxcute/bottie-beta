import { verifyAuth } from "@/lib/auth";
import { getAddCollateralQuote, getRemoveCollateralQuote } from "@/lib/flash";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const { searchParams } = new URL(req.url);
  const ownerAddress = searchParams.get("wallet") ?? "";
  const marketId = Number(searchParams.get("marketId"));
  const collateralUsd = Number(searchParams.get("collateralUsd"));
  const direction = searchParams.get("direction") as "add" | "remove";
  if (!ownerAddress || isNaN(marketId) || !collateralUsd || !direction)
    return new Response("wallet, marketId, collateralUsd, direction required", { status: 400 });
  try {
    const quote = direction === "add"
      ? await getAddCollateralQuote({ ownerAddress, marketId, collateralUsd })
      : await getRemoveCollateralQuote({ ownerAddress, marketId, collateralUsd });
    return Response.json(quote);
  } catch (err) {
    console.error("[flash/collateral-quote]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
