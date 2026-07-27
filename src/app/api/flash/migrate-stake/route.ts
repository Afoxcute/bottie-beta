import { verifyAuth } from "@/lib/auth";
import { buildMigrateStakeTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; flpAmount: number };
  if (!body.ownerAddress || !body.flpAmount) return new Response("ownerAddress, flpAmount required", { status: 400 });
  try {
    const transaction = await buildMigrateStakeTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/migrate-stake]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
