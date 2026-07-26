import { verifyAuth } from "@/lib/auth";
import { getDepositTxData, getWithdrawTxData, getRebalanceTxData } from "@/lib/velvet";

export async function POST(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { type, ...params } = body as { type: string } & Record<string, unknown>;

  try {
    if (type === "deposit") {
      const data = await getDepositTxData(params as Parameters<typeof getDepositTxData>[0]);
      return Response.json(data);
    }
    if (type === "withdraw") {
      const data = await getWithdrawTxData(params as Parameters<typeof getWithdrawTxData>[0]);
      return Response.json(data);
    }
    if (type === "rebalance") {
      const data = await getRebalanceTxData(params as Parameters<typeof getRebalanceTxData>[0]);
      return Response.json(data);
    }
    return new Response("Invalid type", { status: 400 });
  } catch (err: unknown) {
    return new Response((err as Error)?.message ?? "Failed", { status: 500 });
  }
}
