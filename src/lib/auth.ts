import { PrivyClient } from "@privy-io/server-auth";
import { cookies } from "next/headers";

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function verifyAuth(): Promise<{ userId: string }> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get("privy-token")?.value ||
    cookieStore.get("privy-id-token")?.value;

  if (!token) throw new Error("Unauthorized");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await privy.verifyAuthToken(token);
      return { userId: result.userId };
    } catch {
      if (attempt === 1) throw new Error("Unauthorized");
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  throw new Error("Unauthorized");
}
