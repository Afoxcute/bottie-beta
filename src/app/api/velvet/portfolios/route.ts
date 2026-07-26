import { verifyAuth } from "@/lib/auth";
import { getPortfoliosByOwner } from "@/lib/velvet";

export async function GET(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const address = new URL(req.url).searchParams.get("address");
  if (!address) return new Response("address required", { status: 400 });

  try {
    let portfolios: Awaited<ReturnType<typeof getPortfoliosByOwner>> = [];
    try {
      portfolios = await getPortfoliosByOwner(address);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "";
      console.error("[velvet/portfolios] API error:", msg);
      // Velvet API errors (rate limits, Cloudflare blocks, no portfolios) → return empty
      return Response.json({ portfolios: [], _apiError: msg });
    }
    return Response.json({
      portfolios: portfolios.map((p) => ({
        portfolioId: p.portfolioId,
        name: p.name,
        symbol: p.symbol,
        portfolio_address: p.portfolio,
        vault_address: p.vaultAddress,
        rebalancing_address: p.rebalancing,
        asset_management_config: p.assetManagementConfig,
        token_exclusion_manager: p.tokenExclusionManager,
        is_public: p.public,
      })),
    });
  } catch (err: unknown) {
    console.error("[velvet/portfolios]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
