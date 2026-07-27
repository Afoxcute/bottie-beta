import { verifyAuth } from "@/lib/auth";
import { getAvailableTokens } from "@/lib/flash-extra";

export async function GET() {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  try {
    return Response.json(getAvailableTokens());
  } catch (err) {
    console.error("[flash/tokens]", err);
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
