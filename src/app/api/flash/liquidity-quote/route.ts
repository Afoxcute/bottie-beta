import { verifyAuth } from "@/lib/auth";
import {
  getAddLiquidityQuote,
  getRemoveLiquidityQuote,
  getAddCompoundingQuote,
  getRemoveCompoundingQuote,
} from "@/lib/flash-extra";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const { searchParams } = new URL(req.url);
  // action: "add" | "remove" | "sflp-add" | "sflp-remove"
  const action = searchParams.get("action");
  const symbol = searchParams.get("symbol");
  const amount = parseFloat(searchParams.get("amount") ?? "0");
  if (!action || !symbol || !amount)
    return new Response("action, symbol, amount required", { status: 400 });
  try {
    if (action === "add")         return Response.json(await getAddLiquidityQuote({ inSymbol: symbol, amountIn: amount }));
    if (action === "remove")      return Response.json(await getRemoveLiquidityQuote({ outSymbol: symbol, lpAmountIn: amount }));
    if (action === "sflp-add")    return Response.json(await getAddCompoundingQuote({ inSymbol: symbol, amountIn: amount }));
    if (action === "sflp-remove") return Response.json(await getRemoveCompoundingQuote({ outSymbol: symbol, sflpAmountIn: amount }));
    return new Response("action must be add | remove | sflp-add | sflp-remove", { status: 400 });
  } catch (err) {
    console.error("[flash/liquidity-quote]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
