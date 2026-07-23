import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { windowMessages, extractConversationRecap } from "@/lib/ai/window-messages";
import { verifyAuth } from "@/lib/auth";

export async function POST(req: Request) {
  let userId: string;
  try {
    const auth = await verifyAuth();
    userId = auth.userId;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const {
    messages,
    walletAddress,
    userName,
    totalBillsDueUsd,
    portfolioValueUsd,
    billCount,
  } = body as {
    messages: UIMessage[];
    walletAddress?: string;
    userName?: string;
    totalBillsDueUsd?: number;
    portfolioValueUsd?: number;
    billCount?: number;
  };

  if (!Array.isArray(messages)) {
    return new Response("messages must be an array", { status: 400 });
  }

  const tools = createTools(walletAddress, userId);
  const recap = extractConversationRecap(messages);
  const windowed = windowMessages(messages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildSystemPrompt({
      userName,
      walletAddress,
      totalBillsDueUsd,
      portfolioValueUsd,
      billCount,
      conversationRecap: recap || undefined,
    }),
    messages: await convertToModelMessages(windowed),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
