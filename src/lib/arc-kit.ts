import { AppKit, Blockchain, BridgeChain } from "@circle-fin/app-kit";

export const arcKit = new AppKit();

export const AGENT_CHAIN = Blockchain.Base_Sepolia;

export const BRIDGE_SOURCE_OPTIONS = [
  { value: BridgeChain.Arc_Testnet,        label: "Arc Testnet",       icon: "⬡" },
  { value: BridgeChain.Ethereum_Sepolia,   label: "Ethereum Sepolia",  icon: "⟠" },
  { value: BridgeChain.Arbitrum_Sepolia,   label: "Arbitrum Sepolia",  icon: "🔵" },
  { value: BridgeChain.Optimism_Sepolia,   label: "Optimism Sepolia",  icon: "🔴" },
  { value: BridgeChain.Avalanche_Fuji,     label: "Avalanche Fuji",    icon: "🔺" },
  { value: BridgeChain.Polygon_Amoy_Testnet, label: "Polygon Amoy",   icon: "🟣" },
  { value: BridgeChain.Linea_Sepolia,      label: "Linea Sepolia",     icon: "⬜" },
  { value: BridgeChain.Base_Sepolia,       label: "Base Sepolia",      icon: "🔷" },
] as const;

export type BridgeSourceChain = (typeof BRIDGE_SOURCE_OPTIONS)[number]["value"];
