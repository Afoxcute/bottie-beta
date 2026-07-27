import { verifyAuth } from "@/lib/auth";
import { getCloseQuote } from "@/lib/flash";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const { searchParams } = new URL(req.url);
  const ownerAddress = searchParams.get("wallet") ?? "";
  const marketId = Number(searchParams.get("marketId"));
  const sizeDeltaUsd = searchParams.get("sizeDeltaUsd") ? Number(searchParams.get("sizeDeltaUsd")) : undefined;
  if (!ownerAddress || isNaN(marketId)) return new Response("wallet and marketId required", { status: 400 });
  try {
    const quote = await getCloseQuote({ ownerAddress, marketId, sizeDeltaUsd });
    return Response.json(quote);
  } catch (err) {
    console.error("[flash/close-quote]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
