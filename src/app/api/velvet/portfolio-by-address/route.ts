import { verifyAuth } from "@/lib/auth";
import { getPortfolioAddresses, getPortfolioInfo } from "@/lib/velvet";

export async function GET(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const portfolioAddress = params.get("portfolio");
  const userAddress = params.get("address");
  if (!portfolioAddress || !userAddress)
    return new Response("portfolio and address required", { status: 400 });

  try {
    const meta = await getPortfolioAddresses(portfolioAddress);
    if (!meta.vault) return new Response("Not a valid Velvet portfolio contract", { status: 400 });

    const portfolio = {
      portfolioId: portfolioAddress,
      portfolio: portfolioAddress,
      vaultAddress: meta.vault,
      rebalancing: meta.rebalancing ?? "",
      assetManagementConfig: meta.assetManagementConfig ?? "",
      tokenExclusionManager: meta.tokenExclusionManager ?? "",
      name: meta.name,
      symbol: meta.symbol,
      public: true,
      initialized: true,
      owner: userAddress,
      feeModule: "",
      chainID: 8453,
      chainName: "base",
      createdAt: new Date().toISOString(),
    };

    const info = await getPortfolioInfo(portfolio, userAddress);
    return Response.json({
      ...info,
      rebalancing_address: meta.rebalancing ?? "",
      asset_management_config: meta.assetManagementConfig ?? "",
      token_exclusion_manager: meta.tokenExclusionManager ?? "",
    });
  } catch (err: unknown) {
    console.error("[velvet/portfolio-by-address]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
