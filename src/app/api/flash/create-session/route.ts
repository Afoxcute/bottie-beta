import { verifyAuth } from "@/lib/auth";
import { buildCreateSessionTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; sessionSignerPubkey: string; durationHours: number };
  if (!body.ownerAddress || !body.sessionSignerPubkey || !body.durationHours)
    return new Response("ownerAddress, sessionSignerPubkey, durationHours required", { status: 400 });
  try {
    const transaction = await buildCreateSessionTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/create-session]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
