import { verifyAuth } from "@/lib/auth";
import { getSwapQuote } from "@/lib/flash-extra";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const { searchParams } = new URL(req.url);
  const inSymbol = searchParams.get("inSymbol");
  const outSymbol = searchParams.get("outSymbol");
  const amountIn = parseFloat(searchParams.get("amountIn") ?? "0");
  if (!inSymbol || !outSymbol || !amountIn)
    return new Response("inSymbol, outSymbol, amountIn required", { status: 400 });
  try {
    const quote = await getSwapQuote({ inSymbol, outSymbol, amountIn });
    return Response.json(quote);
  } catch (err) {
    console.error("[flash/swap-quote]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
