import { verifyAuth } from "@/lib/auth";
import { buildWithdrawFlashTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; withdrawRequestId: number };
  if (!body.ownerAddress || body.withdrawRequestId == null)
    return new Response("ownerAddress, withdrawRequestId required", { status: 400 });
  try {
    const transaction = await buildWithdrawFlashTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/withdraw-flash]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
