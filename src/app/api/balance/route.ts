import { verifyAuth } from "@/lib/auth";

const PRIVY_BASE = "https://auth.privy.io/api/v1";
const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
const APP_SECRET = process.env.PRIVY_APP_SECRET!;

function privyBasicAuth() {
  return Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");
}

export async function GET(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const walletId = searchParams.get("walletId");
  const token = searchParams.get("token"); // e.g. "base-sepolia:0x036..."

  if (!walletId || !token) {
    return Response.json({ error: "walletId and token are required" }, { status: 400 });
  }

  const privyRes = await fetch(
    `${PRIVY_BASE}/wallets/${encodeURIComponent(walletId)}/balance?token=${encodeURIComponent(token)}`,
    {
      headers: {
        Authorization: `Basic ${privyBasicAuth()}`,
        "privy-app-id": APP_ID,
        "Content-Type": "application/json",
      },
      next: { revalidate: 0 },
    }
  );

  if (!privyRes.ok) {
    return Response.json({ error: "Privy balance fetch failed" }, { status: privyRes.status });
  }

  const data = await privyRes.json();
  // Privy returns { balance, decimals, formatted, symbol }
  return Response.json(data);
}
