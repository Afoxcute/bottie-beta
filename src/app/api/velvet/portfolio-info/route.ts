import { verifyAuth } from "@/lib/auth";
import { getPortfolioInfo } from "@/lib/velvet";

export async function GET(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const p = new URL(req.url).searchParams;
  const userAddress = p.get("address");
  const portfolio = p.get("portfolio");
  const vaultAddress = p.get("vaultAddress");
  const rebalancing = p.get("rebalancing");
  const assetManagementConfig = p.get("assetManagementConfig") ?? "";
  const tokenExclusionManager = p.get("tokenExclusionManager") ?? "";
  const name = p.get("name") ?? "";
  const symbol = p.get("symbol") ?? "";

  if (!userAddress || !portfolio || !vaultAddress || !rebalancing) {
    return new Response("address, portfolio, vaultAddress, rebalancing required", { status: 400 });
  }

  try {
    const info = await getPortfolioInfo(
      { portfolio, vaultAddress, rebalancing, assetManagementConfig, tokenExclusionManager, name, symbol } as Parameters<typeof getPortfolioInfo>[0],
      userAddress,
    );
    return Response.json(info);
  } catch (err: unknown) {
    console.error("[velvet/portfolio-info]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
