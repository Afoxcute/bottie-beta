import { createConfig } from "@privy-io/wagmi";
import { baseSepolia } from "viem/chains";
import { http } from "wagmi";

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(
      alchemyKey
        ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
        : undefined
    ),
  },
});
