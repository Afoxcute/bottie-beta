import { verifyAuth } from "@/lib/auth";
import { buildCollectRebateTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string };
  if (!body.ownerAddress)
    return new Response("ownerAddress required", { status: 400 });
  try {
    const transaction = await buildCollectRebateTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/collect-rebate]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
