import { openai, createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Returns the configured language model.
 *
 * Set AI_PROVIDER=qwen (+ QWEN_API_KEY) to use Qwen Cloud.
 * Default: OpenAI gpt-4o-mini.
 *
 * Qwen Cloud is OpenAI-compatible, so we reuse @ai-sdk/openai with a
 * custom baseURL — no extra package needed.
 */
export function getLanguageModel(): LanguageModel {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

  if (provider === "qwen") {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error("QWEN_API_KEY is not set");

    // Qwen (DashScope) rejects the 'developer' role that AI SDK v6 uses for
    // system messages. Remap it to 'system' at the fetch layer.
    const remapFetch: typeof fetch = async (url, init) => {
      if (init?.body && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);
          if (Array.isArray(body.messages)) {
            body.messages = body.messages.map((m: { role: string }) =>
              m.role === "developer" ? { ...m, role: "system" } : m,
            );
          }
          init = { ...init, body: JSON.stringify(body) };
        } catch {
          // leave body unchanged if parsing fails
        }
      }
      return fetch(url, init);
    };

    const qwen = createOpenAI({
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      apiKey,
      fetch: remapFetch,
    });

    const model = process.env.QWEN_MODEL ?? "qwen-plus";
    // Use Chat Completions format — Qwen's compatible-mode endpoint does not
    // support the OpenAI Responses API format that qwen(model) defaults to.
    return qwen.chat(model) as LanguageModel;
  }

  // Default: OpenAI
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return openai(model) as LanguageModel;
}
