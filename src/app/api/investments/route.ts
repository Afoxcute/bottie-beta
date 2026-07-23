import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { investments } from "@/lib/db/schema";
import { INVESTMENT_OPTIONS } from "@/lib/constants";

export async function GET() {
  let userId: string;
  try {
    const auth = await verifyAuth();
    userId = auth.userId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const positions = await db
      .select()
      .from(investments)
      .where(eq(investments.userId, userId))
      .orderBy(desc(investments.createdAt));

    const portfolio = positions.map((pos) => {
      const market = INVESTMENT_OPTIONS[pos.symbol];
      const currentPrice = market?.currentPriceUsd ?? Number(pos.avgPriceUsd);
      const currentValue = currentPrice * Number(pos.shares);
      const costBasis = Number(pos.avgPriceUsd) * Number(pos.shares);
      return {
        ...pos,
        currentPriceUsd: currentPrice.toFixed(2),
        currentValueUsd: currentValue.toFixed(2),
        gainLossUsd: (currentValue - costBasis).toFixed(2),
        description: market?.description ?? "",
        assetType: market?.type ?? pos.type,
      };
    });

    const totalValueUsd = portfolio.reduce(
      (sum, p) => sum + Number(p.currentValueUsd),
      0
    );

    return NextResponse.json({ portfolio, totalValueUsd: totalValueUsd.toFixed(2) });
  } catch {
    return NextResponse.json({ portfolio: [], totalValueUsd: "0.00" });
  }
}

export async function POST(req: Request) {
  let userId: string;
  try {
    const auth = await verifyAuth();
    userId = auth.userId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { symbol, shares, avgPriceUsd } = body as {
    symbol?: string;
    shares?: string;
    avgPriceUsd?: string;
  };

  if (!symbol || !shares || !avgPriceUsd) {
    return NextResponse.json(
      { error: "Missing required fields: symbol, shares, avgPriceUsd" },
      { status: 400 }
    );
  }

  const sym = symbol.toUpperCase();
  const market = INVESTMENT_OPTIONS[sym];
  if (!market) {
    return NextResponse.json(
      { error: `Unknown symbol: ${sym}` },
      { status: 400 }
    );
  }

  try {
    const [investment] = await db
      .insert(investments)
      .values({
        userId,
        symbol: sym,
        name: market.name,
        type: market.type,
        shares,
        avgPriceUsd,
      })
      .returning();

    return NextResponse.json({ investment }, { status: 201 });
  } catch (err) {
    console.error("[Investments] Insert error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
