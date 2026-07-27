import { verifyAuth } from "@/lib/auth";
import { getUserPositions } from "@/lib/flash";

export async function GET(req: Request) {
  try { await verifyAuth(); } catch { return new Response("Unauthorized", { status: 401 }); }
  const wallet = new URL(req.url).searchParams.get("wallet");
  if (!wallet) return new Response("wallet required", { status: 400 });
  try {
    const data = await getUserPositions(wallet);
    return Response.json(data);
  } catch (err: unknown) {
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
