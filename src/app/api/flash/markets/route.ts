import { verifyAuth } from "@/lib/auth";
import { getMarketsInfo } from "@/lib/flash";

export async function GET() {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  try {
    const markets = getMarketsInfo();
    return Response.json({ markets });
  } catch (err: unknown) {
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
