import { getProvider } from "@/lib/banking/registry";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return new Response(`Unknown provider: ${providerId}`, { status: 404 });
  }

  if (!provider.verifyWebhook(body)) {
    console.warn(`[banking/webhook/${providerId}] Signature verification failed`);
    return new Response("Invalid signature", { status: 401 });
  }

  // Credible Finance webhook shape:
  // { project_id, event_name, signature, webhook_id, created, last_tried_at, retry_counter,
  //   metadata: { merchant_collection_id, collection_id, amount, status, utr?, collection_failure_reason? } }
  const eventName = body.event_name as string | undefined;
  const metadata = (body.metadata ?? {}) as Record<string, unknown>;
  const txId = (metadata.collection_id ?? metadata.payout_id) as string | undefined;
  const status = metadata.status as string | undefined;

  if (eventName === "collection_completed") {
    const utr = metadata.utr as string | undefined;
    console.log(`[banking/webhook/${providerId}] collection_completed id=${txId} status=${status} utr=${utr}`);
  } else if (eventName === "collection_failed") {
    const reason = metadata.collection_failure_reason as string | undefined;
    console.log(`[banking/webhook/${providerId}] collection_failed id=${txId} reason=${reason}`);
  } else {
    console.log(`[banking/webhook/${providerId}] event=${eventName} id=${txId} status=${status}`);
  }

  // TODO: persist status updates to DB or emit server-sent events to connected clients

  return new Response("OK", { status: 200 });
}
