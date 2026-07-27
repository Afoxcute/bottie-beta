import { verifyAuth } from "@/lib/auth";
import { buildMigrateFlpTx } from "@/lib/flash-extra";

export async function POST(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const body = await req.json() as { ownerAddress: string; sflpAmount: number };
  if (!body.ownerAddress || !body.sflpAmount) return new Response("ownerAddress, sflpAmount required", { status: 400 });
  try {
    const transaction = await buildMigrateFlpTx(body);
    return Response.json({ transaction });
  } catch (err) {
    console.error("[flash/migrate-flp]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
