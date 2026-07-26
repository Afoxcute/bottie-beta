import { verifyAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { velvetVaultPrefs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/velvet/vault-prefs — list saved + hidden vault addresses for the user
export async function GET() {
  let userId: string;
  try {
    ({ userId } = await verifyAuth());
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await db
    .select()
    .from(velvetVaultPrefs)
    .where(eq(velvetVaultPrefs.userId, userId));

  return Response.json({
    added:  rows.filter((r) => r.status === "added").map((r) => r.portfolioAddress),
    hidden: rows.filter((r) => r.status === "hidden").map((r) => r.portfolioAddress),
  });
}

// POST /api/velvet/vault-prefs — upsert a vault pref
// body: { portfolioAddress: string, status: "added" | "hidden" }
export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await verifyAuth());
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { portfolioAddress, status } = await req.json() as { portfolioAddress: string; status: string };
  if (!portfolioAddress || !["added", "hidden"].includes(status))
    return new Response("portfolioAddress and status (added|hidden) required", { status: 400 });

  const addr = portfolioAddress.toLowerCase();

  await db
    .insert(velvetVaultPrefs)
    .values({ userId, portfolioAddress: addr, status })
    .onConflictDoUpdate({
      target: [velvetVaultPrefs.userId, velvetVaultPrefs.portfolioAddress],
      set: { status, updatedAt: new Date() },
    });

  return Response.json({ ok: true });
}

// DELETE /api/velvet/vault-prefs?portfolio=0x… — remove a vault pref row entirely
export async function DELETE(req: Request) {
  let userId: string;
  try {
    ({ userId } = await verifyAuth());
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const addr = new URL(req.url).searchParams.get("portfolio")?.toLowerCase();
  if (!addr) return new Response("portfolio required", { status: 400 });

  await db
    .delete(velvetVaultPrefs)
    .where(and(eq(velvetVaultPrefs.userId, userId), eq(velvetVaultPrefs.portfolioAddress, addr)));

  return Response.json({ ok: true });
}
