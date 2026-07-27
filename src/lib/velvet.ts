import { createPublicClient, http, encodeFunctionData, formatEther, formatUnits, parseAbi } from "viem";
import { base } from "viem/chains";

const VELVET_API = "https://api.velvet.capital/api/v3";
const VELVET_EVENTS_API = "https://eventsapi.velvetdao.xyz/api/v3";

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
  });
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://velvet.capital",
  "Referer": "https://velvet.capital/",
};

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Velvet API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...BROWSER_HEADERS },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Velvet API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const PORTFOLIO_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function getTokens() external view returns (address[])",
]);

// Metadata getters present on Velvet portfolio contracts
const PORTFOLIO_META_ABI = parseAbi([
  "function vault() external view returns (address)",
  "function assetManagementConfig() external view returns (address)",
  "function tokenExclusionManager() external view returns (address)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
]);

const ASSET_MGMT_META_ABI = parseAbi([
  "function rebalancing() external view returns (address)",
]);

// Read a Velvet portfolio's related contract addresses from chain
export async function getPortfolioAddresses(portfolioAddress: string) {
  const client = getClient();
  const addr = portfolioAddress as `0x${string}`;
  const [vaultAddr, assetMgmtAddr, tokenExclusionAddr, name, symbol] = await Promise.all([
    client.readContract({ address: addr, abi: PORTFOLIO_META_ABI, functionName: "vault" }).catch(() => null as string | null),
    client.readContract({ address: addr, abi: PORTFOLIO_META_ABI, functionName: "assetManagementConfig" }).catch(() => null as string | null),
    client.readContract({ address: addr, abi: PORTFOLIO_META_ABI, functionName: "tokenExclusionManager" }).catch(() => null as string | null),
    client.readContract({ address: addr, abi: PORTFOLIO_META_ABI, functionName: "name" }).catch(() => "My Vault"),
    client.readContract({ address: addr, abi: PORTFOLIO_META_ABI, functionName: "symbol" }).catch(() => "VAULT"),
  ]);

  let rebalancingAddr: string | null = null;
  if (assetMgmtAddr) {
    rebalancingAddr = await client.readContract({
      address: assetMgmtAddr as `0x${string}`,
      abi: ASSET_MGMT_META_ABI,
      functionName: "rebalancing",
    }).catch(() => null);
  }

  return {
    name: name as string,
    symbol: symbol as string,
    vault: vaultAddr as string,
    assetManagementConfig: assetMgmtAddr as string,
    tokenExclusionManager: tokenExclusionAddr as string,
    rebalancing: rebalancingAddr,
  };
}

const REBALANCING_ABI = parseAbi([
  "function updateTokens((address[] _newTokens, address[] _sellTokens, uint256[] _sellAmounts, address _handler, bytes _callData) calldata rebalanceData) external",
  "function updateWeights(address[] calldata _sellTokens, uint256[] calldata _sellAmounts, address _handler, bytes memory _callData) external",
  "function removePortfolioToken(address _token) external",
  "function removePortfolioTokenPartially(address _token, uint256 _percentage) external",
  "function removeNonPortfolioToken(address _token) external",
  "function enableCollateralTokens(address[] memory _tokens, address _controller) external",
  "function disableCollateralTokens(address[] memory _tokens, address _controller) external",
  "function borrow(address _pool, address[] memory _tokens, address _tokenToBorrow, address _controller, uint256 _amountToBorrow) external",
]);

const ASSET_MGMT_CONFIG_ABI = parseAbi([
  "function proposeNewManagementFee(uint256 _newManagementFee) external",
  "function deleteProposedManagementFee() external",
  "function updateManagementFee() external",
  "function proposeNewPerformanceFee(uint256 _newPerformanceFee) external",
  "function deleteProposedPerformanceFee() external",
  "function updatePerformanceFee() external",
  "function proposeNewEntryAndExitFee(uint256 _newEntryFee, uint256 _newExitFee) external",
  "function deleteProposedEntryAndExitFee() external",
  "function updateEntryAndExitFee() external",
  "function updateTransferability(bool _transferable, bool _publicTransfer) external",
  "function convertPrivateFundToPublic() external",
  "function updateMinPortfolioTokenHoldingAmount(uint256 _minPortfolioTokenHoldingAmount) external",
  "function updateInitialPortfolioAmount(uint256 _newAmount) external",
  "function updateAssetManagerTreasury(address _newAssetManagerTreasury) external",
  "function whitelistUser(address[] calldata users) external",
  "function removeWhitelistedUser(address[] calldata users) external",
  "function enableUniSwapV3Manager() external",
]);

const TOKEN_EXCLUSION_ABI = parseAbi([
  "function claimRemovedTokens(address user, uint256 startId, uint256 endId) external",
  "function claimTokenAtId(address user, uint256 id) external",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
]);

// ─── Portfolio API ────────────────────────────────────────────────────────────

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
  description?: string;
  avatar?: string;
}

export async function getPortfoliosByOwner(ownerAddress: string, chain = "base"): Promise<VelvetPortfolio[]> {
  const data = await apiGet<{ data: VelvetPortfolio[] }>(
    `${VELVET_API}/portfolio/owner/${ownerAddress}?chain=${chain}`
  );
  return data.data ?? [];
}

export async function getPortfolioInfo(
  portfolio: VelvetPortfolio,
  userAddress: string
) {
  const client = getClient();
  const addr = portfolio.portfolio as `0x${string}`;
  const vaultAddr = portfolio.vaultAddress as `0x${string}`;
  const userAddr = userAddress as `0x${string}`;

  const [userBalance, totalSupply, tokenAddresses] = await Promise.all([
    client.readContract({ address: addr, abi: PORTFOLIO_ABI, functionName: "balanceOf", args: [userAddr] }),
    client.readContract({ address: addr, abi: PORTFOLIO_ABI, functionName: "totalSupply" }),
    client.readContract({ address: addr, abi: PORTFOLIO_ABI, functionName: "getTokens" }),
  ]);

  const tokenDetails = await Promise.all(
    (tokenAddresses as `0x${string}`[]).map(async (tokenAddr) => {
      const [sym, dec, vaultBal] = await Promise.all([
        client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "UNKNOWN"),
        client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
        client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [vaultAddr] }).catch(() => 0n),
      ]);
      const decimals = Number(dec);
      return {
        address: tokenAddr,
        symbol: sym as string,
        decimals,
        vault_balance: formatUnits(vaultBal as bigint, decimals),
      };
    })
  );

  const ownershipPct =
    (totalSupply as bigint) > 0n
      ? ((Number(userBalance as bigint) / Number(totalSupply as bigint)) * 100).toFixed(4)
      : "0";

  return {
    name: portfolio.name,
    symbol: portfolio.symbol,
    portfolio_address: portfolio.portfolio,
    vault_address: portfolio.vaultAddress,
    rebalancing_address: portfolio.rebalancing,
    asset_management_config: portfolio.assetManagementConfig,
    token_exclusion_manager: portfolio.tokenExclusionManager,
    total_supply: formatEther(totalSupply as bigint),
    user_balance: formatEther(userBalance as bigint),
    ownership_pct: ownershipPct,
    underlying_tokens: tokenDetails,
  };
}

// ─── Rebalance API ────────────────────────────────────────────────────────────

export interface RebalanceTxData {
  newTokens: string[];
  sellTokens: string[];
  sellAmounts: string[];
  handler: string;
  callData: string;
  estimateGas: string;
  gasPrice: string;
}

export async function getRebalanceTxData(params: {
  rebalanceAddress: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippage: string;
  remainingTokens: string[];
  owner: string;
}): Promise<RebalanceTxData> {
  return apiPost<RebalanceTxData>(`${VELVET_EVENTS_API}/rebalance`, params);
}

// ─── Deposit / Withdraw API ───────────────────────────────────────────────────

export async function getDepositTxData(params: {
  portfolio: string;
  depositAmount: string;
  depositToken: string;
  user: string;
}): Promise<{ to: string; data: string; gasLimit: string; gasPrice: string }> {
  return apiPost(`${VELVET_EVENTS_API}/portfolio/deposit`, {
    depositType: "batch",
    tokenType: "erc20",
    ...params,
  });
}

export async function getWithdrawTxData(params: {
  portfolio: string;
  withdrawAmount: string;
  withdrawToken: string;
  user: string;
}): Promise<{ to: string; data: string; gasLimit: string; gasPrice: string }> {
  return apiPost(`${VELVET_EVENTS_API}/portfolio/withdraw`, {
    withdrawType: "batch",
    tokenType: "erc20",
    ...params,
  });
}

// ─── On-chain encoded tx builders ────────────────────────────────────────────

export function encodeRemovePortfolioToken(
  rebalancingAddress: string,
  tokenAddress: string,
  partial: boolean,
  percentage?: number
): { to: string; data: string } {
  const to = rebalancingAddress;
  if (partial && percentage !== undefined) {
    return {
      to,
      data: encodeFunctionData({
        abi: REBALANCING_ABI,
        functionName: "removePortfolioTokenPartially",
        args: [tokenAddress as `0x${string}`, BigInt(percentage)],
      }),
    };
  }
  return {
    to,
    data: encodeFunctionData({
      abi: REBALANCING_ABI,
      functionName: "removePortfolioToken",
      args: [tokenAddress as `0x${string}`],
    }),
  };
}

export type FeeType = "management" | "performance" | "entry_and_exit";
export type FeeAction = "propose" | "update" | "cancel";

export function encodeFeeCall(
  configAddress: string,
  feeType: FeeType,
  action: FeeAction,
  newFeeBps?: number,
  newExitFeeBps?: number
): { to: string; data: string } {
  const to = configAddress;
  const abi = ASSET_MGMT_CONFIG_ABI;

  if (action === "propose") {
    if (feeType === "management") {
      return { to, data: encodeFunctionData({ abi, functionName: "proposeNewManagementFee", args: [BigInt(newFeeBps ?? 0)] }) };
    }
    if (feeType === "performance") {
      return { to, data: encodeFunctionData({ abi, functionName: "proposeNewPerformanceFee", args: [BigInt(newFeeBps ?? 0)] }) };
    }
    return { to, data: encodeFunctionData({ abi, functionName: "proposeNewEntryAndExitFee", args: [BigInt(newFeeBps ?? 0), BigInt(newExitFeeBps ?? 0)] }) };
  }

  if (action === "cancel") {
    if (feeType === "management") return { to, data: encodeFunctionData({ abi, functionName: "deleteProposedManagementFee" }) };
    if (feeType === "performance") return { to, data: encodeFunctionData({ abi, functionName: "deleteProposedPerformanceFee" }) };
    return { to, data: encodeFunctionData({ abi, functionName: "deleteProposedEntryAndExitFee" }) };
  }

  // action === "update"
  if (feeType === "management") return { to, data: encodeFunctionData({ abi, functionName: "updateManagementFee" }) };
  if (feeType === "performance") return { to, data: encodeFunctionData({ abi, functionName: "updatePerformanceFee" }) };
  return { to, data: encodeFunctionData({ abi, functionName: "updateEntryAndExitFee" }) };
}

export function encodeWhitelistCall(
  configAddress: string,
  action: "add" | "remove",
  users: string[]
): { to: string; data: string } {
  const to = configAddress;
  const abi = ASSET_MGMT_CONFIG_ABI;
  const addrs = users as `0x${string}`[];
  return {
    to,
    data: action === "add"
      ? encodeFunctionData({ abi, functionName: "whitelistUser", args: [addrs] })
      : encodeFunctionData({ abi, functionName: "removeWhitelistedUser", args: [addrs] }),
  };
}

export function encodeTransferabilityCall(
  configAddress: string,
  transferable: boolean,
  publicTransfer: boolean
): { to: string; data: string } {
  return {
    to: configAddress,
    data: encodeFunctionData({ abi: ASSET_MGMT_CONFIG_ABI, functionName: "updateTransferability", args: [transferable, publicTransfer] }),
  };
}

export function encodeConvertToPublicCall(configAddress: string): { to: string; data: string } {
  return {
    to: configAddress,
    data: encodeFunctionData({ abi: ASSET_MGMT_CONFIG_ABI, functionName: "convertPrivateFundToPublic" }),
  };
}

export function encodeTreasuryCall(configAddress: string, newTreasury: string): { to: string; data: string } {
  return {
    to: configAddress,
    data: encodeFunctionData({ abi: ASSET_MGMT_CONFIG_ABI, functionName: "updateAssetManagerTreasury", args: [newTreasury as `0x${string}`] }),
  };
}

export function encodeMinHoldingAmountCall(configAddress: string, minAmountWei: bigint): { to: string; data: string } {
  return {
    to: configAddress,
    data: encodeFunctionData({ abi: ASSET_MGMT_CONFIG_ABI, functionName: "updateMinPortfolioTokenHoldingAmount", args: [minAmountWei] }),
  };
}

export function encodeInitialPortfolioAmountCall(configAddress: string, amountWei: bigint): { to: string; data: string } {
  return {
    to: configAddress,
    data: encodeFunctionData({ abi: ASSET_MGMT_CONFIG_ABI, functionName: "updateInitialPortfolioAmount", args: [amountWei] }),
  };
}

export function encodeEnableUniswapV3ManagerCall(configAddress: string): { to: string; data: string } {
  return {
    to: configAddress,
    data: encodeFunctionData({ abi: ASSET_MGMT_CONFIG_ABI, functionName: "enableUniSwapV3Manager" }),
  };
}

export function encodeCollateralTokensCall(
  rebalancingAddress: string,
  action: "enable" | "disable",
  tokens: string[],
  controller: string
): { to: string; data: string } {
  const tokenAddrs = tokens as `0x${string}`[];
  const controllerAddr = controller as `0x${string}`;
  return {
    to: rebalancingAddress,
    data: action === "enable"
      ? encodeFunctionData({ abi: REBALANCING_ABI, functionName: "enableCollateralTokens", args: [tokenAddrs, controllerAddr] })
      : encodeFunctionData({ abi: REBALANCING_ABI, functionName: "disableCollateralTokens", args: [tokenAddrs, controllerAddr] }),
  };
}

export function encodeBorrowCall(
  rebalancingAddress: string,
  pool: string,
  tokens: string[],
  tokenToBorrow: string,
  controller: string,
  amountToBorrow: bigint
): { to: string; data: string } {
  return {
    to: rebalancingAddress,
    data: encodeFunctionData({
      abi: REBALANCING_ABI,
      functionName: "borrow",
      args: [pool as `0x${string}`, tokens as `0x${string}`[], tokenToBorrow as `0x${string}`, controller as `0x${string}`, amountToBorrow],
    }),
  };
}

export function encodeClaimRemovedTokens(
  tokenExclusionManagerAddress: string,
  userAddress: string,
  startId: number,
  endId: number
): { to: string; data: string } {
  return {
    to: tokenExclusionManagerAddress,
    data: encodeFunctionData({
      abi: TOKEN_EXCLUSION_ABI,
      functionName: "claimRemovedTokens",
      args: [userAddress as `0x${string}`, BigInt(startId), BigInt(endId)],
    }),
  };
}

// ─── Legacy helpers ───────────────────────────────────────────────────────────

export async function getPortfolioTokenBalance(portfolioAddress: string, userAddress: string): Promise<string> {
  const client = getClient();
  const balance = await client.readContract({
    address: portfolioAddress as `0x${string}`,
    abi: PORTFOLIO_ABI,
    functionName: "balanceOf",
    args: [userAddress as `0x${string}`],
  });
  return formatEther(balance as bigint);
}

export async function getPortfolioTokens(portfolioAddress: string): Promise<string[]> {
  const client = getClient();
  const tokens = await client.readContract({
    address: portfolioAddress as `0x${string}`,
    abi: PORTFOLIO_ABI,
    functionName: "getTokens",
  });
  return tokens as string[];
}
