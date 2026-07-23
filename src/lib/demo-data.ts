export type DemoBill = {
  id: string;
  name: string;
  category: "streaming" | "internet" | "cable" | "utility";
  amount: number;
  icon: string;
  description: string;
  dueDay: number;
};

export type DemoAsset = {
  symbol: string;
  name: string;
  type: "stock" | "ipo" | "etf";
  priceUsd: number;
  change24h: number;
  description: string;
  icon: string;
};

export const DEMO_BILLS: DemoBill[] = [
  { id: "netflix",       name: "Netflix",               category: "streaming", amount: 15.49,  icon: "🎬", description: "Standard HD Plan",       dueDay: 5  },
  { id: "spotify",       name: "Spotify",               category: "streaming", amount: 9.99,   icon: "🎵", description: "Premium Individual",      dueDay: 12 },
  { id: "hbo",           name: "Max",                   category: "streaming", amount: 15.99,  icon: "📺", description: "Ad-Free Plan",            dueDay: 18 },
  { id: "disney",        name: "Disney+",               category: "streaming", amount: 7.99,   icon: "✨", description: "Basic Plan",              dueDay: 22 },
  { id: "apple_tv",      name: "Apple TV+",             category: "streaming", amount: 9.99,   icon: "🍎", description: "Individual Plan",         dueDay: 8  },
  { id: "hulu",          name: "Hulu",                  category: "streaming", amount: 17.99,  icon: "🟩", description: "No Ads Plan",             dueDay: 15 },
  { id: "youtube",       name: "YouTube Premium",       category: "streaming", amount: 13.99,  icon: "▶️", description: "Individual Plan",         dueDay: 3  },
  { id: "amazon_prime",  name: "Amazon Prime",          category: "streaming", amount: 14.99,  icon: "📦", description: "Prime membership",        dueDay: 28 },
  { id: "comcast",       name: "Xfinity Internet",      category: "internet",  amount: 79.99,  icon: "📡", description: "400 Mbps Plan",           dueDay: 10 },
  { id: "att_internet",  name: "AT&T Fiber",            category: "internet",  amount: 65.00,  icon: "🌐", description: "1 Gig Internet",          dueDay: 20 },
  { id: "verizon",       name: "Verizon Home Internet", category: "internet",  amount: 69.99,  icon: "📶", description: "LTE Home Internet",       dueDay: 25 },
  { id: "xfinity_tv",   name: "Xfinity TV",            category: "cable",     amount: 89.99,  icon: "📻", description: "Popular TV Package",      dueDay: 10 },
  { id: "directv",       name: "DirecTV",               category: "cable",     amount: 74.99,  icon: "🛰️", description: "Choice Package",          dueDay: 17 },
  { id: "electricity",   name: "Electric Bill",         category: "utility",   amount: 120.00, icon: "⚡", description: "Monthly electricity",     dueDay: 15 },
  { id: "water",         name: "Water & Sewer",         category: "utility",   amount: 45.00,  icon: "💧", description: "Monthly utilities",       dueDay: 20 },
  { id: "gas",           name: "Natural Gas",           category: "utility",   amount: 38.50,  icon: "🔥", description: "Monthly gas bill",        dueDay: 12 },
];

export const DEMO_ASSETS: DemoAsset[] = [
  { symbol: "AAPL",   name: "Apple Inc.",       type: "stock", priceUsd: 182.50, change24h:  1.24, description: "Consumer electronics & software",  icon: "🍎" },
  { symbol: "TSLA",   name: "Tesla Inc.",        type: "stock", priceUsd: 247.80, change24h: -2.31, description: "Electric vehicles & clean energy",  icon: "⚡" },
  { symbol: "GOOGL",  name: "Alphabet Inc.",     type: "stock", priceUsd: 141.20, change24h:  0.87, description: "Search, cloud & AI",               icon: "🔍" },
  { symbol: "MSFT",   name: "Microsoft Corp.",   type: "stock", priceUsd: 378.90, change24h:  0.52, description: "Software, cloud & AI",             icon: "💻" },
  { symbol: "NVDA",   name: "NVIDIA Corp.",      type: "stock", priceUsd: 495.30, change24h:  3.14, description: "GPUs & AI chips",                  icon: "🎮" },
  { symbol: "AMZN",   name: "Amazon.com Inc.",   type: "stock", priceUsd: 185.40, change24h:  1.05, description: "E-commerce & cloud",               icon: "📦" },
  { symbol: "SPACEX", name: "SpaceX",            type: "ipo",   priceUsd: 185.00, change24h:  0.00, description: "Space exploration & Starlink",     icon: "🚀" },
  { symbol: "OPENAI", name: "OpenAI",            type: "ipo",   priceUsd: 150.00, change24h:  0.00, description: "Artificial intelligence research", icon: "🤖" },
  { symbol: "SPY",    name: "S&P 500 ETF",       type: "etf",   priceUsd: 498.20, change24h:  0.43, description: "Tracks the S&P 500 index",         icon: "📊" },
  { symbol: "QQQ",    name: "Nasdaq-100 ETF",    type: "etf",   priceUsd: 425.10, change24h:  0.71, description: "Tracks the Nasdaq-100 index",      icon: "📈" },
];

export const ASSET_PRICES: Record<string, number> = Object.fromEntries(
  DEMO_ASSETS.map((a) => [a.symbol, a.priceUsd])
);
