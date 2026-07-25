const VELVET_API = "https://api.velvet.capital/api/v3";
const VELVET_EVENTS_API = "https://eventsapi.velvetdao.xyz/api/v3";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Velvet API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Velvet API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface VelvetPortfolio {
  portfolioId: string;
  portfolio: string;
  name: string;
  symbol: string;
  public: boolean;
  initialized: boolean;
  rebalancing: string;
  owner: string;
  vaultAddress: string;
  assetManagementConfig: string;
  feeModule: string;
  tokenExclusionManager: string;
  chainID: number;
  chainName: string;
  createdAt: string;
}

export async function getPortfoliosByOwner(ownerAddress: string, chain = "base"): Promise<VelvetPortfolio[]> {
  const data = await get<{ data: VelvetPortfolio[] }>(
    `${VELVET_API}/portfolio/owner/${ownerAddress}?chain=${chain}`
  );
  return data.data ?? [];
}

export interface RebalanceParams {
  rebalanceAddress: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippage: string;
  remainingTokens: string[];
  owner: string;
}

export interface RebalanceTxData {
  newTokens: string[];
  sellTokens: string[];
  sellAmounts: string[];
  handler: string;
  callData: string;
  estimateGas: string;
  gasPrice: string;
}

export async function getRebalanceTxData(params: RebalanceParams): Promise<RebalanceTxData> {
  return post<RebalanceTxData>(`${VELVET_EVENTS_API}/rebalance`, params);
}

export interface DepositParams {
  portfolio: string;
  depositAmount: string;
  depositToken: string;
  user: string;
  depositType?: string;
  tokenType?: string;
}

export async function getDepositTxData(params: DepositParams): Promise<{ to: string; data: string; gasLimit: string; gasPrice: string }> {
  return post(`${VELVET_EVENTS_API}/portfolio/deposit`, {
    depositType: "batch",
    tokenType: "erc20",
    ...params,
  });
}

export interface WithdrawParams {
  portfolio: string;
  withdrawAmount: string;
  withdrawToken: string;
  user: string;
  withdrawType?: string;
  tokenType?: string;
}

export async function getWithdrawTxData(params: WithdrawParams): Promise<{ to: string; data: string; gasLimit: string; gasPrice: string }> {
  return post(`${VELVET_EVENTS_API}/portfolio/withdraw`, {
    withdrawType: "batch",
    tokenType: "erc20",
    ...params,
  });
}

const PORTFOLIO_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function getTokens() external view returns (address[])",
];

export async function getPortfolioTokenBalance(portfolioAddress: string, userAddress: string): Promise<string> {
  const { ethers } = await import("ethers");
  const rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(portfolioAddress, PORTFOLIO_ABI, provider);
  const [balance, totalSupply] = await Promise.all([
    contract.balanceOf(userAddress),
    contract.totalSupply(),
  ]);
  return ethers.formatEther(balance);
}

export async function getPortfolioTokens(portfolioAddress: string): Promise<string[]> {
  const { ethers } = await import("ethers");
  const rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(portfolioAddress, PORTFOLIO_ABI, provider);
  return contract.getTokens();
}
