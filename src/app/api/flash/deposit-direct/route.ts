import { verifyAuth } from "@/lib/auth";
import { buildDepositDirectTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; tokenSymbol: string; amount: number };
  if (!body.ownerAddress || !body.tokenSymbol || !body.amount)
    return new Response("ownerAddress, tokenSymbol, amount required", { status: 400 });
  try {
    const transaction = await buildDepositDirectTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/deposit-direct]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
