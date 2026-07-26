import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { getLanguageModel } from "@/lib/ai/model-provider";
import { createTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { windowMessages, extractConversationRecap } from "@/lib/ai/window-messages";
import { verifyAuth } from "@/lib/auth";

/**
 * AI SDK v6 puts all parts from a multi-step round-trip into a single
 * assistant CoreMessage: [text_before, tool-call, text_after].
 *
 * text_after is logically produced AFTER the tool result, so placing it
 * before the tool-result message confuses models (they see "I already have
 * the answer" + "call the tool" simultaneously). This function repairs the
 * messages array:
 *   BEFORE: assistant[text_before, tool-call, text_after] → tool[result] → …
 *   AFTER:  assistant[text_before, tool-call] → tool[result] → assistant[text_after] → …
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function repairToolMessages(msgs: any[]): any[] {
  const result: any[] = [];

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];

    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      result.push(msg);
      continue;
    }

    const content = msg.content as Array<{ type: string; [k: string]: unknown }>;
    const toolCallIdx = content.findIndex((p) => p.type === "tool-call");

    if (toolCallIdx === -1) {
      // No tool call — nothing to repair
      result.push(msg);
      continue;
    }

    // Check if the NEXT message is a tool result (makes the post-tool split meaningful)
    const nextMsg = msgs[i + 1];
    const nextIsToolResult =
      nextMsg?.role === "tool" ||
      (nextMsg?.role === "assistant" && Array.isArray(nextMsg.content) &&
        (nextMsg.content as Array<{ type: string }>).some((p) => p.type === "tool-result"));

    if (!nextIsToolResult) {
      result.push(msg);
      continue;
    }

    // Split: parts up to and including the last tool-call go into the current message;
    // any text parts that come AFTER the last tool-call move to a new assistant message.
    const lastToolCallIdx = content.reduce(
      (last, p, idx) => (p.type === "tool-call" ? idx : last),
      -1,
    );

    const before = content.slice(0, lastToolCallIdx + 1);
    const after = content.slice(lastToolCallIdx + 1).filter((p) => p.type === "text");

    result.push({ ...msg, content: before });

    // Collect all tool-result messages that follow before inserting the continuation
    let j = i + 1;
    while (j < msgs.length && (msgs[j].role === "tool" ||
      (msgs[j].role === "assistant" && Array.isArray(msgs[j].content) &&
        (msgs[j].content as Array<{ type: string }>).some((p) => p.type === "tool-result")))) {
      result.push(msgs[j]);
      j++;
    }
    i = j - 1; // advance outer loop past consumed tool-result messages

    // Insert the post-tool text as a new assistant message (if any)
    if (after.length > 0) {
      result.push({ role: "assistant", content: after });
    }
  }

  return result;
}

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
    solanaAddress,
    userName,
    walletBalance,
    solanaBalance,
    paidBillIds,
    totalBillsDueUsd,
    portfolioValueUsd,
    billCount,
  } = body as {
    messages: UIMessage[];
    walletAddress?: string;
    solanaAddress?: string;
    userName?: string;
    walletBalance?: number;
    solanaBalance?: number;
    paidBillIds?: string[];
    totalBillsDueUsd?: number;
    portfolioValueUsd?: number;
    billCount?: number;
  };

  if (!Array.isArray(messages)) {
    return new Response("messages must be an array", { status: 400 });
  }

  const tools = createTools(walletAddress, userId, solanaAddress, Array.isArray(paidBillIds) ? paidBillIds : []);
  const recap = extractConversationRecap(messages);
  const windowed = windowMessages(messages);

  let modelMessages;
  try {
    modelMessages = repairToolMessages(
      await convertToModelMessages(windowed, { ignoreIncompleteToolCalls: true }),
    );
    console.log('[chat] modelMessages count:', modelMessages.length, 'roles:', modelMessages.map((m: { role: string }) => m.role).join('->'));
  } catch (err) {
    console.error('[chat] convertToModelMessages failed:', err);
    return new Response('Message conversion failed', { status: 500 });
  }

  try {
    const result = streamText({
      model: getLanguageModel(),
      system: buildSystemPrompt({
        userName,
        walletAddress,
        solanaAddress,
        walletBalance,
        solanaBalance,
        totalBillsDueUsd,
        portfolioValueUsd,
        billCount,
        conversationRecap: recap || undefined,
      }),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      onError: (err) => console.error('[chat] streamText error:', err),
    });
    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error('[chat] streamText setup error:', err);
    return new Response('AI service error', { status: 503 });
  }
}
