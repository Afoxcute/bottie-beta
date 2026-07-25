const SANA_MCP_URL = "https://mcp.sana.bot/mcp";

function getApiKey(): string {
  const key = process.env.SANABOT_API_KEY;
  if (!key) throw new Error("SANABOT_API_KEY is not configured");
  return key;
}

let _reqId = 0;

async function mcpCall<T = unknown>(method: string, params: object = {}): Promise<T> {
  const id = ++_reqId;
  const res = await fetch(SANA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (!res.ok) {
    throw new Error(`Sana gateway ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }

  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Sana: ${json.error.message}`);
  return json.result as T;
}

export function callTool<T = unknown>(name: string, args: object = {}): Promise<T> {
  return mcpCall<T>("tools/call", { name, arguments: args });
}

export function isSanaConfigured(): boolean {
  return Boolean(process.env.SANABOT_API_KEY);
}
