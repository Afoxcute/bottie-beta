export function logActivity(params: {
  type: string;
  amount: string;
  tokenSymbol: string;
  vaultId?: string;
  txHash?: string;
}) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}
