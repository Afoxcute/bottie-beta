import { verifyAuth } from "@/lib/auth";
import { buildCreateReferralTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; referrerAddress: string };
  if (!body.ownerAddress || !body.referrerAddress)
    return new Response("ownerAddress, referrerAddress required", { status: 400 });
  try {
    const transaction = await buildCreateReferralTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/create-referral]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
