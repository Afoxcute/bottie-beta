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

    const qwen = createOpenAI({
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      apiKey,
    });

    const model = process.env.QWEN_MODEL ?? "qwen-plus";
    return qwen(model) as LanguageModel;
  }

  // Default: OpenAI
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return openai(model) as LanguageModel;
}
