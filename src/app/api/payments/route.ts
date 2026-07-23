import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";

export async function GET(req: Request) {
  let userId: string;
  try {
    const auth = await verifyAuth();
    userId = auth.userId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const type = searchParams.get("type"); // "bill" | "investment"

    const allPayments = await db
      .select()
      .from(payments)
      .where(
        type
          ? and(eq(payments.userId, userId), eq(payments.type, type))
          : eq(payments.userId, userId)
      )
      .orderBy(desc(payments.createdAt))
      .limit(limit);

    return NextResponse.json({ payments: allPayments });
  } catch {
    return NextResponse.json({ payments: [] });
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

  const { type, referenceId, description, amountUsdc, status, txHash } =
    body as {
      type?: string;
      referenceId?: string;
      description?: string;
      amountUsdc?: string;
      status?: string;
      txHash?: string;
    };

  if (!type || !description || !amountUsdc || !status) {
    return NextResponse.json(
      { error: "Missing required fields: type, description, amountUsdc, status" },
      { status: 400 }
    );
  }

  const validTypes = ["bill", "investment"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const [payment] = await db
      .insert(payments)
      .values({
        userId,
        type,
        referenceId: referenceId ?? null,
        description,
        amountUsdc,
        status,
        txHash: txHash ?? null,
      })
      .returning();

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    console.error("[Payments] Insert error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
