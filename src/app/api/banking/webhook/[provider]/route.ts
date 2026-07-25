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

  const eventName = body.event_name as string | undefined;
  const metadata = (body.metadata ?? {}) as Record<string, unknown>;

  // ── Collection events ──────────────────────────────────────────────────────
  if (eventName === "collection_completed") {
    const { collection_id, merchant_collection_id, amount, status, utr } = metadata;
    console.log(`[webhook/${providerId}] collection_completed id=${collection_id} ref=${merchant_collection_id} amount=${amount} status=${status} utr=${utr}`);
    // TODO: update collection status in DB

  } else if (eventName === "collection_failed") {
    const { collection_id, merchant_collection_id, amount, status, collection_failure_reason } = metadata;
    console.log(`[webhook/${providerId}] collection_failed id=${collection_id} ref=${merchant_collection_id} amount=${amount} status=${status} reason=${collection_failure_reason}`);
    // TODO: update collection status in DB

  // ── Onramp events ──────────────────────────────────────────────────────────
  } else if (eventName === "onramp_payment_received") {
    const { order_id } = metadata;
    console.log(`[webhook/${providerId}] onramp_payment_received order=${order_id} — INR confirmed, crypto withdrawal pending`);
    // TODO: notify customer, update order status in DB

  } else if (eventName === "onramp_completed") {
    const { order_id, tx_hash } = metadata;
    console.log(`[webhook/${providerId}] onramp_completed order=${order_id} tx=${tx_hash}`);
    // TODO: mark order complete, show tx_hash to customer

  } else if (eventName === "onramp_expired") {
    const { order_id } = metadata;
    console.log(`[webhook/${providerId}] onramp_expired order=${order_id} — customer did not pay in time`);
    // TODO: update order status in DB

  } else if (eventName === "onramp_failed") {
    const { order_id, reason } = metadata;
    console.log(`[webhook/${providerId}] onramp_failed order=${order_id} reason=${reason}`);
    // TODO: alert support, update order status in DB

  // ── Payout events ──────────────────────────────────────────────────────────
  } else if (eventName === "payout_completed") {
    const { merchant_payout_id, payout_id, transaction_reference_no } = metadata;
    console.log(`[webhook/${providerId}] payout_completed id=${payout_id} ref=${merchant_payout_id} txref=${transaction_reference_no}`);
    // TODO: mark payout complete in DB, notify merchant

  } else if (eventName === "payout_failed") {
    const { merchant_payout_id, payout_id, payout_failure_reason } = metadata;
    console.log(`[webhook/${providerId}] payout_failed id=${payout_id} ref=${merchant_payout_id} reason=${payout_failure_reason}`);
    // TODO: mark payout failed in DB, trigger retry or alert

  // ── Offramp events ─────────────────────────────────────────────────────────
  } else if (eventName === "offramp_deposit_detected") {
    const { order_id } = metadata;
    console.log(`[webhook/${providerId}] offramp_deposit_detected order=${order_id} — crypto deposit on-chain, awaiting confirmation`);
    // TODO: update order status to DEPOSIT_PENDING

  } else if (eventName === "offramp_payout_initiated") {
    const { order_id } = metadata;
    console.log(`[webhook/${providerId}] offramp_payout_initiated order=${order_id} — INR payout submitted to bank`);
    // TODO: update order status to PAYOUT_INITIATED

  } else if (eventName === "offramp_completed") {
    const { order_id, payout_utr } = metadata;
    console.log(`[webhook/${providerId}] offramp_completed order=${order_id} utr=${payout_utr}`);
    // TODO: mark order complete, show UTR to customer

  } else if (eventName === "offramp_failed") {
    const { order_id, reason } = metadata;
    console.log(`[webhook/${providerId}] offramp_failed order=${order_id} reason=${reason}`);
    // TODO: alert support, mark order failed

  // ── Deposit events ─────────────────────────────────────────────────────────
  } else if (eventName === "new_deposit") {
    const { amount, currency, blockchain, sub_account_id, transaction_id } = metadata;
    console.log(`[webhook/${providerId}] new_deposit amount=${amount} ${currency} blockchain=${blockchain} sub_account=${sub_account_id} tx=${transaction_id}`);
    // TODO: update payout wallet balance, credit sub-account

  // ── Credit events ──────────────────────────────────────────────────────────
  } else if (eventName === "credit_limit_updated") {
    const { last_30_days_volume, new_credit_limit, old_credit_limit } = metadata;
    console.log(`[webhook/${providerId}] credit_limit_updated old=${old_credit_limit} new=${new_credit_limit} vol30d=${last_30_days_volume}`);
    // TODO: update credit limit in dashboard

  } else {
    console.log(`[webhook/${providerId}] unknown event="${eventName}"`, metadata);
  }

  return new Response("OK", { status: 200 });
}
