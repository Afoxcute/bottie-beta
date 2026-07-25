import { PrivyClient } from "@privy-io/server-auth";
import { cookies, headers } from "next/headers";

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function verifyAuth(): Promise<{ userId: string }> {
  // 1. Try Authorization: Bearer header first (explicit token from client)
  let token: string | undefined;
  try {
    const headerStore = await headers();
    const auth = headerStore.get("authorization") ?? headerStore.get("Authorization");
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  } catch {
    // headers() may not be available in all contexts
  }

  // 2. Fall back to Privy session cookies
  if (!token) {
    const cookieStore = await cookies();
    token =
      cookieStore.get("privy-token")?.value ||
      cookieStore.get("privy-id-token")?.value;
  }

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
