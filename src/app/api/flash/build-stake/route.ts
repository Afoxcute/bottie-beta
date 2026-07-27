import { verifyAuth } from "@/lib/auth";
import { buildStakeFlashTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; amount: number };
  if (!body.ownerAddress || !body.amount)
    return new Response("ownerAddress, amount required", { status: 400 });
  try {
    const transaction = await buildStakeFlashTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/build-stake]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
