import { verifyAuth } from "@/lib/auth";
import { getProvider } from "@/lib/banking/registry";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  let userId: string;
  try { const auth = await verifyAuth(); userId = auth.userId; } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { provider: providerId } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { amount, description, customerRef } = body as {
    amount?: number;
    description?: string;
    customerRef?: string;
  };

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return Response.json({ error: "amount must be a positive number" }, { status: 422 });
  }

  try {
    const provider = getProvider(providerId);

    if (amount < provider.minCollectionAmount) {
      return Response.json(
        { error: `Minimum collection amount is ${provider.currencySymbol}${provider.minCollectionAmount}` },
        { status: 422 },
      );
    }

    const result = await provider.initiateCollection(userId, { amount, description, customerRef });
    return Response.json(result);
  } catch (err: any) {
    const status = err?.message?.startsWith("Unknown banking provider") ? 404 : 502;
    return Response.json({ error: err?.message ?? "Failed" }, { status });
  }
}
