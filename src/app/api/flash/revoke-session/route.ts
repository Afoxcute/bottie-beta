import { verifyAuth } from "@/lib/auth";
import { buildRevokeSessionTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; sessionSignerPubkey: string };
  if (!body.ownerAddress || !body.sessionSignerPubkey)
    return new Response("ownerAddress, sessionSignerPubkey required", { status: 400 });
  try {
    const transaction = await buildRevokeSessionTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/revoke-session]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
