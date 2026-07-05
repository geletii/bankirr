/**
 * Bankirr — portfolio compute core (DOM-free).
 *
 * Shared verbatim between the browser dashboard and the API server:
 *  - Browser: loaded as a classic script before app.js; instantiates itself
 *    from window globals and exposes window.BankirrCore.
 *  - Node: require() returns the factory; server/portfolio.js calls it with an
 *    explicit environment (ethers, fetch with /api rewrites, storage, runtime).
 *
 * env contract: { ethers, fetch, storage (localStorage-like), runtime (object
 * or () => object with coingeckoKey/coingeckoKeyType/rpc) }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory;
  } else {
    root.BankirrCore = factory({
      ethers: root.ethers,
      fetch: (...args) => root.fetch(...args),
      storage: root.localStorage,
      runtime: () => root.BANKIRR_RUNTIME || {},
    });
  }
})(typeof self !== "undefined" ? self : globalThis, function (env) {
const { ethers } = env;
const fetch = env.fetch;
const localStorage = env.storage;

const CONFIG = {
  rpcUrls: [
    "https://eth.drpc.org",
    "https://cloudflare-eth.com",
    "https://rpc.mevblocker.io",
    "https://ethereum.publicnode.com",
    "https://eth.llamarpc.com",
  ],
  unichainRpcUrls: [
    "https://mainnet.unichain.org",
    "https://unichain-rpc.publicnode.com",
  ],
  lidoAprUrl: "https://eth-api.lido.fi/v1/protocol/steth/apr/last",
  revertPositionsUrl: "/api/revert/positions",
  revertAccountPositionsUrl: "/api/revert/account-positions",
  revertPositionDetailUrl: "/api/revert/position-detail",
  v2LpUrl: "/api/onchain/v2-lp",
  tokenBalancesUrl: "/api/onchain/token-balances",
  coingeckoSimplePriceUrl: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  coingeckoNativePriceUrl:
    "https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token,matic-network&vs_currencies=usd",
  geckoEthTokenUrl: "https://api.geckoterminal.com/api/v2/networks/eth/tokens/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  lidoWstEthTokenUrl: "https://api.geckoterminal.com/api/v2/networks/eth/tokens/0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  coingeckoTokenPriceUrl:
    "https://api.coingecko.com/api/v3/simple/token_price/ethereum?vs_currencies=usd&contract_addresses=",
  geckoPoolBaseUrl: "https://api.geckoterminal.com/api/v2/networks",
  geckoTokenBaseUrl: "https://api.geckoterminal.com/api/v2/networks",
  spark: {
    protocolDataProvider: "0xFc21d6d146E6086B8359705C8b28512a983db0cb",
    pool: "0xC13e21B648A5Ee794902342038FF3aDAB66BE987",
    wstEth: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  },
  multicall3: "0xca11bde05977b3631167028862be2a173976ca11",
  knownStablecoins: new Set([
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "0x6b175474e89094c44da98b954eedeac495271d0f",
    "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
    "0x078d782b760474a361dda0af3839290b0ef57ad6",
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
  ]),
  knownEthLike: new Set([
    "0x0000000000000000000000000000000000000000",
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "0x4200000000000000000000000000000000000006",
    "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  ]),
  uniswap: {
    ethereum: {
      label: "Ethereum Uniswap V3",
      geckoNetwork: "eth",
      chainId: 1,
      rpcUrls: null,
      positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      deploymentBlock: 12369621,
      v4PositionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
      v4DeploymentBlock: 21600000,
    },
    unichain: {
      label: "Unichain Uniswap V3",
      geckoNetwork: "unichain",
      chainId: 130,
      rpcUrls: null,
      positionManager: "0x943e6e07a7e8e791dafc44083e54041d743c46e9",
      factory: "0x1f98400000000000000000000000000000000003",
      deploymentBlock: 0,
      v4PositionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
      v4DeploymentBlock: 0,
    },
    bnb: {
      label: "BNB Uniswap V3",
      geckoNetwork: "bsc",
      chainId: 56,
      rpcUrls: ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com"],
      positionManager: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      deploymentBlock: 26324014,
    },
  },
};

CONFIG.uniswap.ethereum.rpcUrls = CONFIG.rpcUrls;
CONFIG.uniswap.unichain.rpcUrls = CONFIG.unichainRpcUrls;
CONFIG.networks = {
  ethereum: {
    label: "Ethereum",
    chainId: 1,
    rpcUrls: CONFIG.rpcUrls,
    geckoNetwork: "eth",
    nativeSymbol: "ETH",
    nativePriceKey: "ETH",
  },
  unichain: {
    label: "Unichain",
    chainId: 130,
    rpcUrls: CONFIG.unichainRpcUrls,
    geckoNetwork: "unichain",
    nativeSymbol: "ETH",
    nativePriceKey: "ETH",
  },
  base: {
    label: "Base",
    chainId: 8453,
    rpcUrls: ["https://mainnet.base.org", "https://base.publicnode.com"],
    geckoNetwork: "base",
    nativeSymbol: "ETH",
    nativePriceKey: "ETH",
  },
  arbitrum: {
    label: "Arbitrum",
    chainId: 42161,
    rpcUrls: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com"],
    geckoNetwork: "arbitrum",
    nativeSymbol: "ETH",
    nativePriceKey: "ETH",
  },
  optimism: {
    label: "Optimism",
    chainId: 10,
    rpcUrls: ["https://mainnet.optimism.io", "https://optimism.publicnode.com"],
    geckoNetwork: "optimism",
    nativeSymbol: "ETH",
    nativePriceKey: "ETH",
  },
  polygon: {
    label: "Polygon",
    chainId: 137,
    rpcUrls: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"],
    geckoNetwork: "polygon_pos",
    nativeSymbol: "POL",
    nativePriceKey: "POL",
  },
  bnb: {
    label: "BNB",
    chainId: 56,
    rpcUrls: ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com"],
    geckoNetwork: "bsc",
    nativeSymbol: "BNB",
    nativePriceKey: "BNB",
  },
};
CONFIG.revertNetworks = [
  { id: "unichain", label: "Unichain Uniswap", aliases: ["unichain", "unichain_mainnet"] },
  { id: "ethereum", label: "Ethereum Uniswap", aliases: ["ethereum", "mainnet"] },
  { id: "bnb", label: "BNB Uniswap", aliases: ["bnb", "bsc", "bnbchain", "bsc_mainnet", "bnb_mainnet"] },
  { id: "base", label: "Base Uniswap", aliases: ["base"] },
  { id: "arbitrum", label: "Arbitrum Uniswap", aliases: ["arbitrum"] },
  { id: "optimism", label: "Optimism Uniswap", aliases: ["optimism"] },
  { id: "polygon", label: "Polygon Uniswap", aliases: ["polygon"] },
];
const REVERT_SUPPORTED_EXCHANGE_PREFIXES = ["uniswap", "sushiswap", "aerodrome", "pancakeswap"];
CONFIG.aaveMarkets = [
  {
    network: "ethereum",
    label: "Ethereum",
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    protocolDataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
  },
  {
    network: "base",
    label: "Base",
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    protocolDataProvider: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
  },
  {
    network: "arbitrum",
    label: "Arbitrum",
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    protocolDataProvider: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
  },
  {
    network: "optimism",
    label: "Optimism",
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    protocolDataProvider: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
  },
  {
    network: "polygon",
    label: "Polygon",
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    protocolDataProvider: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
  },
];
CONFIG.aaveV4 = {
  network: "ethereum",
  lendingSpokes: [
    { label: "Main", address: "0x94e7A5dCbE816e498b89aB752661904E2F56c485" },
    { label: "Bluechip", address: "0x973a023A77420ba610f06b3858aD991Df6d85A08" },
    { label: "Ethena Corr.", address: "0x58131E79531caB1d52301228d1f7b842F26B9649" },
    { label: "Ethena Eco.", address: "0xba1B3D55D249692b669A164024A838309B7508AF" },
    { label: "Forex", address: "0xD8B93635b8C6d0fF98CbE90b5988E3F2d1Cd9da1" },
    { label: "Gold", address: "0x65407b940966954b23dfA3caA5C0702bB42984DC" },
    { label: "Lombard BTC", address: "0x7EC68b5695e803e98a21a9A05d744F28b0a7753D" },
    { label: "USDG Pendle", address: "0x956d8e0A89cfa3744428C4641b5a53B56167a7f9" },
    { label: "Ether.fi", address: "0xbF10BDfE177dE0336aFD7fcCF80A904E15386219" },
    { label: "Kelp", address: "0x3131FE68C4722e726fe6B2819ED68e514395B9a4" },
    { label: "Lido", address: "0xe1900480ac69f0B296841Cd01cC37546d92F35Cd" },
  ],
  tokenizationVaults: [
    { label: "Core WETH", address: "0x7320CF22Ac095bA2a2e0a652F77efB836c2E751b" },
    { label: "Core wstETH", address: "0xcb0E7dA9c635628f6d4827355AeCa75aB8d3560f" },
    { label: "Core weETH", address: "0x559cEc2C840D9DBB18936Afc5E5341D78bfC7Cbe" },
    { label: "Core rsETH", address: "0x45a04Ca1A5cbEeA4B44356c75EDd29b33eB2527a" },
    { label: "Core USDT", address: "0x5eC44a70F309854fe04d495cFE1B5dA63DD1cc73" },
    { label: "Core USDC", address: "0x531E90a2376902DE8915789Fcc1075e3B0c153E7" },
    { label: "Core GHO", address: "0x58C14a5E061c9bC6926c5b853445290F296C2F7B" },
    { label: "Core RLUSD", address: "0xC8a125AE4275a78AADc53B46Ca10566Bc9B249E0" },
    { label: "Core USDG", address: "0xAC2435E3C25e8246870D33ce0a26988A46d5DB68" },
    { label: "Core frxUSD", address: "0x2226749630775ee20230Ad65214fB339087eF30D" },
    { label: "Core EURC", address: "0x6D9e2Cdd61CaF69af99b275704B6e272C41c6718" },
    { label: "Core WBTC", address: "0x82A9CC4656784E55Ef2E78F704028B5E1Bfc1732" },
    { label: "Core cbBTC", address: "0x33B41B74366F55327d959FfF6D6b6fBc2853dbB1" },
    { label: "Core LBTC", address: "0x7961F140B570490849DB878AE222570ea838799d" },
    { label: "Core XAUt", address: "0x4E712562fcb5337011398B6C630f55b60641cd5e" },
    { label: "Core AAVE", address: "0x0A65197b16C5969F92672051c9C9C0C75B369135" },
    { label: "Core LINK", address: "0xE69C2045095C8Ab3E2a7d77de2328faE5baF797c" },
    { label: "Plus PT sUSDe", address: "0x90774889c22D2F2Adf44da1f04C7c95542590df4" },
    { label: "Plus PT USDe", address: "0xdd2Eb78BF9e6aC5068B95aD2d451e8c9Af10ac81" },
    { label: "Plus sUSDe", address: "0x24f8c062e1E0451736C1D6E023510DA262a41df4" },
    { label: "Plus USDe", address: "0x502Cd81da6a8F1785eb2eEE72713B7388E16A854" },
    { label: "Plus USDC", address: "0xc94bdd83D2c7655C280655D60954e79E88D4F949" },
    { label: "Plus GHO", address: "0xA54382db40EC602c0a173A08f9E86Ed40F9D4D10" },
    { label: "Plus USDT", address: "0x80835EB50694EE0e519743f67e5401e6FD300006" },
    { label: "Prime WETH", address: "0x2087513383330B961A3753B47627Bbf149F31c70" },
    { label: "Prime WBTC", address: "0x5AE3d87De89CA6Ce501e8317887F71EABED69E18" },
    { label: "Prime cbBTC", address: "0xD38098faf52D8E915EdED84fBF30F81C17906938" },
    { label: "Prime wstETH", address: "0xFCD3D3C69cd032DE0cc78fE529B7447D2fe7F666" },
    { label: "Prime USDC", address: "0x486415fb1F8b062c89ED548f871cf64304AACb31" },
    { label: "Prime USDT", address: "0x46c588DD8453aC259c1f6a54b4C9A93C2aC3762D" },
    { label: "Prime GHO", address: "0x900fD46d565d1ac8995928c0179052ec02a6D0E1" },
    { label: "Paxos PT USDG", address: "0x27eF1140364948A0E30E248297FfDFE5a4091ec4" },
    { label: "Paxos USDC", address: "0x4131E0B2E7AFeCEAf3d3b4225aA61a3B2B7535b8" },
    { label: "Paxos USDT", address: "0x8Dabe53E8cB991c57f0307F6f419E6D469b0deAA" },
  ],
};

const ABIS = {
  protocolDataProvider: [
    "function getAllReservesTokens() view returns (tuple(string symbol,address tokenAddress)[])",
    "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)",
    "function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)",
    "function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
  ],
  multicall3: [
    "function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns (tuple(bool success,bytes returnData)[] returnData)",
  ],
  pool: [
    "function getUserAccountData(address user) view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)",
  ],
  erc20: [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ],
  wstEth: [
    "function stEthPerToken() view returns (uint256)",
  ],
  nft: [
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
    "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
    "function collect(tuple(uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) payable returns (uint256 amount0,uint256 amount1)",
  ],
  nftV4: [
    "function balanceOf(address owner) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function getPoolAndPositionInfo(uint256 tokenId) view returns (bytes32 poolId,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper)",
    "function getPositionLiquidity(uint256 tokenId) view returns (uint128 liquidity)",
  ],
  factory: ["function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)"],
  uniPool: [
    "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
    "function liquidity() view returns (uint128)",
  ],
  uniV2Pair: [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
    "function totalSupply() view returns (uint256)",
  ],
  aaveV4Spoke: [
    "function getReserveCount() view returns (uint256)",
    "function getReserve(uint256 reserveId) view returns (tuple(address underlying,address hub,uint16 assetId,uint8 decimals,uint24 collateralRisk,uint8 flags,uint32 dynamicConfigKey))",
    "function getUserSuppliedAssets(uint256 reserveId,address user) view returns (uint256)",
    "function getUserTotalDebt(uint256 reserveId,address user) view returns (uint256)",
    "function getUserAccountData(address user) view returns (tuple(uint256 riskPremium,uint256 avgCollateralFactor,uint256 healthFactor,uint256 totalCollateralValue,uint256 totalDebtValueRay,uint256 activeCollateralCount,uint256 borrowCount))",
  ],
  aaveV4Hub: [
    "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
    "function getAssetTotalOwed(uint256 assetId) view returns (uint256)",
    "function getAssetLiquidity(uint256 assetId) view returns (uint256)",
    "function getAsset(uint256 assetId) view returns (tuple(uint120 liquidity,uint120 realizedFees,uint8 decimals,uint120 addedShares,uint120 swept,int200 premiumOffsetRay,uint120 drawnShares,uint120 premiumShares,uint16 liquidityFee,uint120 drawnIndex,uint96 drawnRate,uint40 lastUpdateTimestamp,address underlying,address irStrategy,address reinvestmentController,address feeReceiver,uint200 deficitRay))",
  ],
  aaveV4Vault: [
    "function balanceOf(address owner) view returns (uint256)",
    "function convertToAssets(uint256 shares) view returns (uint256)",
    "function asset() view returns (address)",
    "function hub() view returns (address)",
    "function assetId() view returns (uint256)",
    "function decimals() view returns (uint8)",
  ],
};

function resolveBrowserApiBase() {
  const rt = typeof env.runtime === "function" ? env.runtime() : (env.runtime || {});
  return String(rt.apiBase || "").trim().replace(/\/$/, "");
}

function prefixApiPaths(config) {
  const base = resolveBrowserApiBase();
  if (!base) return;
  config.revertPositionsUrl = base + config.revertPositionsUrl;
  config.revertAccountPositionsUrl = base + config.revertAccountPositionsUrl;
  config.revertPositionDetailUrl = base + config.revertPositionDetailUrl;
  config.v2LpUrl = base + config.v2LpUrl;
  config.tokenBalancesUrl = base + config.tokenBalancesUrl;
}

prefixApiPaths(CONFIG);

const state = {
  address: "",
  ens: "",
  provider: null,
  providers: {},
  ethUsd: 0,
  lastUpdated: null,
  timestamps: {},
  sourceErrors: {},
  injectedProvider: null,
  uniswapPositionIdCache: new Map(),
};
function fmtUsd(value, options = {}) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: options.compact ? 0 : 2,
  });
}

function fmtNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtPct(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const TOKEN_SYMBOL_ALIASES = {
  "⚗️": "JONES",
  "🥒": "PICKLE",
};

function normalizeTokenSymbol(symbol = "") {
  const trimmed = String(symbol || "").trim();
  return TOKEN_SYMBOL_ALIASES[trimmed] || trimmed;
}

function normalizePairName(pair = "") {
  const [left = "", right = ""] = String(pair || "").split("/");
  const a = normalizeTokenSymbol(left) || "?";
  const b = normalizeTokenSymbol(right) || "?";
  return `${a}/${b}`;
}

function formatPositionRef(position) {
  const id = String(position.tokenId || "");
  if (/^v2:/i.test(id)) {
    const pool = id.split(":")[1];
    return pool ? `Pool ${shortAddress(pool)}` : "V2 LP";
  }
  if (/^\d+$/.test(id)) return `#${id}`;
  if (/^0x[a-fA-F0-9]{40}$/.test(id)) return `#${shortAddress(id)}`;
  if (id.length > 18) return `#${shortAddress(id)}`;
  return id ? `#${id}` : "LP";
}

function byIdChecksum(address) {
  try {
    return ethers.getAddress(address);
  } catch {
    return "";
  }
}

function rayToApr(rayValue) {
  // Convert Aave/Spark RAY rate (1e27) to APY %
  // Protocol stores per-second compounding rate; APY = ((1 + rate/SECONDS_PER_YEAR)^SECONDS_PER_YEAR - 1) * 100
  const SECONDS_PER_YEAR = 31536000;
  const ratePerSecond = Number(ethers.formatUnits(rayValue || 0n, 27));
  return (Math.pow(1 + ratePerSecond / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
}

function dailyUsd(valueUsd, aprPercent) {
  if (!Number.isFinite(valueUsd) || !Number.isFinite(aprPercent)) return 0;
  return (valueUsd * (aprPercent / 100)) / 365;
}

async function getProvider() {
  return getNetworkProvider("ethereum");
}

async function getNetworkProvider(network = "ethereum") {
  if (state.providers[network]) return state.providers[network];
  const networkConfig = CONFIG.networks[network] || CONFIG.networks.ethereum;
  // Prefer a server-configured (keyed) RPC for this network, then public fallbacks.
  const runtimeRpc = bankirrRuntime().rpc || {};
  const rpcUrls = [runtimeRpc[network], ...(networkConfig.rpcUrls || [])].filter(Boolean);
  const chainId = networkConfig.chainId;
  let lastError;
  for (const url of rpcUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true, batchMaxCount: 1 });
      await provider.getBlockNumber();
      state.providers[network] = provider;
      if (network === "ethereum") state.provider = provider;
      return provider;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No public ${networkConfig.label || network} RPC responded. ${lastError?.shortMessage || lastError?.message || ""}`);
}

// Runtime config injected by the server sandbox (API keys, custom RPC URLs).
// In the browser this is undefined, so behaviour is unchanged (each user's IP).
function bankirrRuntime() {
  return (typeof env.runtime === "function" ? env.runtime() : env.runtime) || {};
}

// Adds provider auth to outbound requests when a key is configured server-side.
// CoinGecko demo keys use a header on the public host; pro keys use the pro host.
function applyApiAuth(url, options = {}) {
  const runtime = bankirrRuntime();
  const headers = { ...(options.headers || {}) };
  let nextUrl = url;
  if (runtime.coingeckoKey && url.includes("coingecko.com")) {
    if (runtime.coingeckoKeyType === "pro") {
      nextUrl = url.replace("https://api.coingecko.com", "https://pro-api.coingecko.com");
      headers["x-cg-pro-api-key"] = runtime.coingeckoKey;
    } else {
      headers["x-cg-demo-api-key"] = runtime.coingeckoKey;
    }
  }
  return { url: nextUrl, options: { ...options, headers } };
}

async function fetchJson(url, options = {}) {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const auth = applyApiAuth(url, fetchOptions);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(auth.url, { ...auth.options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithRetry(url, options = {}, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchJson(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        // Exponential backoff; wait longer when we are being rate limited (429).
        const isRateLimited = String(error?.message || "").includes("429");
        const base = isRateLimited ? 1500 : 300;
        await delay(base * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function settleWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = { status: "fulfilled", value: await mapper(items[currentIndex], currentIndex) };
      } catch (error) {
        results[currentIndex] = { status: "rejected", reason: error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveWallet(input) {
  const provider = await getProvider();
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a wallet address or ENS name.");

  if (trimmed.endsWith(".eth")) {
    const resolved = await provider.resolveName(trimmed);
    if (!resolved) throw new Error(`ENS name ${trimmed} did not resolve.`);
    return { address: ethers.getAddress(resolved), ens: trimmed };
  }

  const address = byIdChecksum(trimmed);
  if (!address) throw new Error("That is not a valid Ethereum address or ENS name.");
  let ens = "";
  try {
    ens = (await provider.lookupAddress(address)) || "";
  } catch {
    ens = "";
  }
  return { address, ens };
}

async function loadMarketData(tokenAddresses = [], options = {}) {
  const key = marketCacheKey(tokenAddresses);
  if (!options.forceRefresh && marketDataCache && marketDataCache.key === key && Date.now() - marketDataCache.fetchedAt < MARKET_CACHE_TTL_MS) {
    return marketDataCache.value;
  }

  const [nativeResult, lidoResult] = await Promise.allSettled([
    fetchNativeUsdPrices(),
    fetchJson(CONFIG.lidoAprUrl),
  ]);

  // Native prices come from the rate-limited public price APIs, so a transient
  // failure/0 must not zero out a chain's native balance — reuse last-known good.
  const native = nativeResult.status === "fulfilled" ? nativeResult.value : {};
  const freshEth = Number(native.ethUsd || 0);
  const freshPol = Number(native.polUsd || 0);
  const freshBnb = Number(native.bnbUsd || 0);
  state.ethUsd = freshEth > 0 ? freshEth : lastNativePrices.ethUsd || 0;
  const polUsd = freshPol > 0 ? freshPol : lastNativePrices.polUsd || 0;
  const bnbUsd = freshBnb > 0 ? freshBnb : lastNativePrices.bnbUsd || 0;
  if (state.ethUsd > 0) lastNativePrices.ethUsd = state.ethUsd;
  if (polUsd > 0) lastNativePrices.polUsd = polUsd;
  if (bnbUsd > 0) lastNativePrices.bnbUsd = bnbUsd;
  const wstEthUsd = await fetchWstEthUsd();
  state.timestamps.price = new Date();
  const lidoApr =
    lidoResult.status === "fulfilled"
      ? Number(lidoResult.value.data?.apr ?? lidoResult.value.apr ?? lidoResult.value)
      : NaN;

  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))].filter(Boolean);
  const tokenPrices = {};
  if (wstEthUsd > 0) tokenPrices[CONFIG.spark.wstEth] = wstEthUsd;
  unique.forEach((address) => {
    const fallback = fallbackTokenPrice(address, "", state.ethUsd, wstEthUsd);
    if (fallback > 0) tokenPrices[address] = fallback;
  });
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    try {
      const result = await fetchJson(`${CONFIG.coingeckoTokenPriceUrl}${chunk.join(",")}`);
      Object.entries(result).forEach(([address, data]) => {
        tokenPrices[address.toLowerCase()] = Number(data.usd || 0) || tokenPrices[address.toLowerCase()] || 0;
      });
    } catch {
      chunk.forEach((address) => {
        tokenPrices[address.toLowerCase()] ||= fallbackTokenPrice(address, "", state.ethUsd, wstEthUsd);
      });
    }
  }

  state.timestamps.market = new Date();
  const value = { ethUsd: state.ethUsd, polUsd, bnbUsd, lidoApr, tokenPrices, wstEthUsd };
  marketDataCache = { key, fetchedAt: Date.now(), value };
  return value;
}

async function fetchEthUsd() {
  try {
    const result = await fetchJson(CONFIG.coingeckoSimplePriceUrl, { timeoutMs: 2500 });
    const price = Number(result.ethereum?.usd || 0);
    if (price > 0) return { price, source: "CoinGecko ETH" };
  } catch {
    // Try GeckoTerminal below.
  }

  try {
    const result = await fetchJson(CONFIG.geckoEthTokenUrl, { timeoutMs: 2500 });
    const price = Number(result.data?.attributes?.price_usd || 0);
    if (price > 0) return { price, source: "GeckoTerminal WETH" };
  } catch {
    // Try a conservative fallback below.
  }

  return { price: 0, source: "unavailable" };
}

// All supported native prices in a single CoinGecko call (fewer requests = less
// rate-limiting), with a GeckoTerminal fallback for ETH (the critical one).
async function fetchNativeUsdPrices() {
  let ethUsd = 0;
  let polUsd = 0;
  let bnbUsd = 0;
  try {
    const result = await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,polygon-ecosystem-token,matic-network,binancecoin&vs_currencies=usd",
      { timeoutMs: 3000 },
    );
    ethUsd = Number(result.ethereum?.usd || 0);
    polUsd = Number(result["polygon-ecosystem-token"]?.usd || result["matic-network"]?.usd || 0);
    bnbUsd = Number(result.binancecoin?.usd || 0);
  } catch {
    // Fall through to the ETH-only fallback below.
  }
  if (ethUsd <= 0) {
    ethUsd = (await fetchEthUsd()).price;
  }
  return { ethUsd, polUsd, bnbUsd };
}

async function fetchWstEthUsd() {
  try {
    const result = await fetchJson(CONFIG.lidoWstEthTokenUrl, { timeoutMs: 2500 });
    const price = Number(result.data?.attributes?.price_usd || 0);
    if (price > 0) return price;
  } catch {
    // Try the on-chain conversion below.
  }

  try {
    const provider = await getProvider();
    const wstEth = new ethers.Contract(CONFIG.spark.wstEth, ABIS.wstEth, provider);
    const stEthPerToken = Number(ethers.formatEther(await wstEth.stEthPerToken()));
    return state.ethUsd > 0 ? stEthPerToken * state.ethUsd : 0;
  } catch {
    return 0;
  }
}

function fallbackTokenPrice(address, symbol = "", ethUsd = state.ethUsd, wstEthUsd = 0) {
  const key = String(address || "").toLowerCase();
  const normalizedSymbol = String(symbol || "").toUpperCase();
  if (key === CONFIG.spark.wstEth || normalizedSymbol === "WSTETH") return wstEthUsd || ethUsd || 0;
  if (CONFIG.knownStablecoins.has(key)) return 1;
  if (["USDC", "USDT", "DAI", "USDS", "SUSDS"].includes(normalizedSymbol)) return 1;
  if (CONFIG.knownEthLike.has(key)) return ethUsd || 0;
  if (["ETH", "WETH", "WSTETH", "WEETH", "WETH9"].includes(normalizedSymbol)) return ethUsd || 0;
  return 0;
}

// Token prices do not depend on the wallet, so cache them globally (shared
// across all wallets/users on the server) to avoid hammering GeckoTerminal.
const onchainPriceCache = new Map(); // `${network}:${address}` -> { price, fetchedAt }
const ONCHAIN_PRICE_TTL_MS = 5 * 60 * 1000;
const ONCHAIN_PRICE_MAX = 2000;

async function fetchOnchainTokenPrices(network, tokenAddresses = [], market = {}) {
  const unique = [...new Set(tokenAddresses.map((address) => address.toLowerCase()))].filter(Boolean);
  const tokenPrices = {};
  await Promise.all(
    unique.map(async (address) => {
      const cacheKey = `${network}:${address}`;
      const cached = onchainPriceCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < ONCHAIN_PRICE_TTL_MS && cached.price > 0) {
        tokenPrices[address] = cached.price;
        return;
      }
      let price;
      try {
        const result = await fetchJson(`${CONFIG.geckoTokenBaseUrl}/${network}/tokens/${address}`, { timeoutMs: 2500 });
        const symbol = result.data?.attributes?.symbol || "";
        price =
          Number(result.data?.attributes?.price_usd || 0) ||
          fallbackTokenPrice(address, symbol, market.ethUsd || state.ethUsd, market.wstEthUsd || 0);
      } catch {
        price = fallbackTokenPrice(address, "", market.ethUsd || state.ethUsd, market.wstEthUsd || 0);
      }
      tokenPrices[address] = price;
      if (price > 0) {
        if (onchainPriceCache.has(cacheKey)) onchainPriceCache.delete(cacheKey);
        onchainPriceCache.set(cacheKey, { price, fetchedAt: Date.now() });
        while (onchainPriceCache.size > ONCHAIN_PRICE_MAX) {
          onchainPriceCache.delete(onchainPriceCache.keys().next().value);
        }
      }
    }),
  );
  return tokenPrices;
}

async function loadSpark(address, market) {
  const provider = await getProvider();
  const dataProviderAddress = CONFIG.spark.protocolDataProvider;
  const poolAddress = CONFIG.spark.pool;

  const pool = new ethers.Contract(poolAddress, ABIS.pool, provider);
  try {
    const account = await pool.getUserAccountData(address);
    const accountCollateralUsd = Number(ethers.formatUnits(account.totalCollateralBase, 8));
    const accountDebtUsd = Number(ethers.formatUnits(account.totalDebtBase, 8));
    if (accountCollateralUsd < 0.01 && accountDebtUsd < 0.01) {
      state.timestamps.spark = new Date();
      return emptySpark();
    }
  } catch {
    // Fall through to full reserve scan when the quick probe fails.
  }

  const dataProvider = new ethers.Contract(dataProviderAddress, ABIS.protocolDataProvider, provider);
  const reserves = await dataProvider.getAllReservesTokens();
  const [userData, reserveRates, tokenMeta] = await Promise.all([
    multicallSparkUserData(dataProviderAddress, reserves, address, provider),
    multicallSparkReserveRates(dataProviderAddress, reserves, provider),
    multicallTokenMeta(reserves.map((reserve) => reserve.tokenAddress), provider),
  ]);

  const tokenAddresses = reserves.map((reserve) => reserve.tokenAddress);
  const prices = market.tokenPrices;
  const supplies = [];
  const borrows = [];
  let assetsUsd = 0;
  let debtUsd = 0;
  let supplyDaily = 0;
  let lidoDaily = 0;
  let borrowDaily = 0;

  for (let i = 0; i < reserves.length; i += 1) {
    const reserve = reserves[i];
    const user = userData[i];
    const data = reserveRates[i];
    const meta = tokenMeta[i];
    if (!user || !data) continue;
    const asset = reserve.tokenAddress.toLowerCase();
    const decimals = meta?.decimals ?? 18;
    const symbol = meta?.symbol || reserve.symbol;
    const price = prices[asset] || fallbackTokenPrice(asset, symbol, market.ethUsd, market.wstEthUsd);
    const supplyBalance = Number(ethers.formatUnits(user.currentATokenBalance, decimals));
    const stableDebt = Number(ethers.formatUnits(user.currentStableDebt, decimals));
    const variableDebt = Number(ethers.formatUnits(user.currentVariableDebt, decimals));
    const supplyApy = rayToApr(data.liquidityRate);
    const borrowApr = variableDebt > 0 ? rayToApr(data.variableBorrowRate) : rayToApr(user.stableBorrowRate);

    if (supplyBalance > 0.0000001) {
      const valueUsd = supplyBalance * price;
      const interestDaily = dailyUsd(valueUsd, supplyApy);
      const isWstEth = asset === CONFIG.spark.wstEth;
      const stakingDaily = isWstEth && Number.isFinite(market.lidoApr) ? dailyUsd(valueUsd, market.lidoApr) : 0;
      assetsUsd += valueUsd;
      supplyDaily += interestDaily;
      lidoDaily += stakingDaily;
      supplies.push({
        symbol,
        balance: supplyBalance,
        valueUsd,
        supplyApy: isWstEth && Number.isFinite(market.lidoApr) ? supplyApy + market.lidoApr : supplyApy,
        daily: interestDaily + stakingDaily,
        note: isWstEth && Number.isFinite(market.lidoApr) ? `Includes Lido ${fmtPct(market.lidoApr)}` : "",
      });
    }

    const totalDebt = stableDebt + variableDebt;
    if (totalDebt > 0.0000001) {
      const valueUsd = totalDebt * price;
      const daily = dailyUsd(valueUsd, borrowApr);
      debtUsd += valueUsd;
      borrowDaily += daily;
      borrows.push({ symbol, balance: totalDebt, valueUsd, borrowApr, daily });
    }
  }

  let healthFactor = Infinity;
  let accountCollateralUsd = 0;
  let accountDebtUsd = 0;
  try {
    const account = await pool.getUserAccountData(address);
    accountCollateralUsd = Number(ethers.formatUnits(account.totalCollateralBase, 8));
    accountDebtUsd = Number(ethers.formatUnits(account.totalDebtBase, 8));
    healthFactor =
      account.healthFactor >= ethers.parseUnits("1000000", 18)
        ? Infinity
        : Number(ethers.formatUnits(account.healthFactor, 18));
  } catch {
    healthFactor = NaN;
  }

  state.timestamps.spark = new Date();
  return {
    supplies,
    borrows,
    assetsUsd: accountCollateralUsd || assetsUsd,
    debtUsd: accountDebtUsd || debtUsd,
    netUsd: (accountCollateralUsd || assetsUsd) - (accountDebtUsd || debtUsd),
    daily: supplyDaily + lidoDaily - borrowDaily,
    supplyDaily,
    lidoDaily,
    borrowDaily,
    healthFactor,
  };
}

async function loadNativeBalances(address, market) {
  const entries = Object.entries(CONFIG.networks);
  const results = await Promise.allSettled(
    entries.map(([network, config]) =>
      withTimeout(loadNativeBalance(address, network, config, market), 6000, `${config.label} native balance`),
    ),
  );
  const failedNetworks = results
    .map((result, index) => ({ result, network: entries[index][1] }))
    .filter(({ result }) => result.status === "rejected");
  const balances = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((item) => item.balance > 0.000001 && item.valueUsd >= 0.01);

  state.timestamps.native = new Date();
  return {
    balances,
    assetsUsd: balances.reduce((sum, item) => sum + item.valueUsd, 0),
    failedNetworks,
  };
}

async function loadNativeBalance(address, network, config, market) {
  const provider = await getNetworkProvider(network);
  const rawBalance = await provider.getBalance(address);
  const balance = Number(ethers.formatEther(rawBalance));
  const priceUsd = nativePriceUsd(config.nativePriceKey, market);
  return {
    network: config.label,
    symbol: config.nativeSymbol,
    balance,
    priceUsd,
    valueUsd: balance * priceUsd,
  };
}

function nativePriceUsd(priceKey, market) {
  if (priceKey === "ETH") return market.ethUsd || 0;
  if (priceKey === "POL") return market.polUsd || 0;
  if (priceKey === "BNB") return market.bnbUsd || 0;
  return 0;
}

async function loadAave(address, market) {
  const [marketResults, v4Result] = await Promise.all([
    Promise.allSettled(
      CONFIG.aaveMarkets.map((aaveMarket) =>
        withTimeout(loadAaveMarket(address, market, aaveMarket), 9000, `Aave ${aaveMarket.label}`),
      ),
    ),
    Promise.allSettled([
      withTimeout(loadAaveV4Ethereum(address, market), 20000, "Aave v4 Ethereum"),
    ]),
  ]);
  const loadedMarkets = marketResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  if (v4Result[0]?.status === "fulfilled") {
    loadedMarkets.push(v4Result[0].value);
  }
  const failedMarkets = marketResults
    .map((result, index) => ({ result, market: CONFIG.aaveMarkets[index] }))
    .filter(({ result }) => result.status === "rejected");
  if (v4Result[0]?.status === "rejected") {
    failedMarkets.push({ result: v4Result[0], market: { label: "Aave v4 Ethereum" } });
  }

  if (loadedMarkets.length === 0 && failedMarkets.length > 0) {
    throw failedMarkets[0].result.reason;
  }

  const supplies = loadedMarkets.flatMap((item) => item.supplies);
  const borrows = loadedMarkets.flatMap((item) => item.borrows);
  const finiteHealthFactors = loadedMarkets
    .map((item) => item.healthFactor)
    .filter((value) => Number.isFinite(value));
  state.timestamps.aave = new Date();
  return {
    supplies,
    borrows,
    assetsUsd: loadedMarkets.reduce((sum, item) => sum + item.assetsUsd, 0),
    debtUsd: loadedMarkets.reduce((sum, item) => sum + item.debtUsd, 0),
    daily: loadedMarkets.reduce((sum, item) => sum + item.daily, 0),
    supplyDaily: loadedMarkets.reduce((sum, item) => sum + item.supplyDaily, 0),
    borrowDaily: loadedMarkets.reduce((sum, item) => sum + item.borrowDaily, 0),
    healthFactor: finiteHealthFactors.length ? Math.min(...finiteHealthFactors) : NaN,
    failedMarkets,
  };
}

async function loadAaveMarket(address, market, aaveMarket) {
  const networkConfig = CONFIG.networks[aaveMarket.network];
  const provider = await getNetworkProvider(aaveMarket.network);
  const dataProviderAddress = aaveMarket.protocolDataProvider;
  const poolAddress = aaveMarket.pool;
  const dataProvider = new ethers.Contract(dataProviderAddress, ABIS.protocolDataProvider, provider);
  const pool = new ethers.Contract(poolAddress, ABIS.pool, provider);
  const reserves = await dataProvider.getAllReservesTokens();
  const [userData, reserveRates, tokenMeta, account] = await Promise.all([
    multicallSparkUserData(dataProviderAddress, reserves, address, provider),
    multicallSparkReserveRates(dataProviderAddress, reserves, provider),
    multicallTokenMeta(reserves.map((reserve) => reserve.tokenAddress), provider),
    pool.getUserAccountData(address).catch(() => null),
  ]);

  const activeAddresses = [];
  for (let i = 0; i < reserves.length; i += 1) {
    const user = userData[i];
    if (!user) continue;
    if (user.currentATokenBalance > 0n || user.currentStableDebt > 0n || user.currentVariableDebt > 0n) {
      activeAddresses.push(reserves[i].tokenAddress);
    }
  }
  const networkPrices = activeAddresses.length
    ? await fetchOnchainTokenPrices(networkConfig.geckoNetwork, activeAddresses, market)
    : {};

  const supplies = [];
  const borrows = [];
  let assetsUsd = 0;
  let debtUsd = 0;
  let supplyDaily = 0;
  let borrowDaily = 0;

  for (let i = 0; i < reserves.length; i += 1) {
    const reserve = reserves[i];
    const user = userData[i];
    const data = reserveRates[i];
    const meta = tokenMeta[i];
    if (!user || !data) continue;
    const asset = reserve.tokenAddress.toLowerCase();
    const decimals = meta?.decimals ?? 18;
    const symbol = meta?.symbol || reserve.symbol;
    const price =
      networkPrices[asset] ||
      market.tokenPrices[asset] ||
      fallbackTokenPrice(asset, symbol, market.ethUsd, market.wstEthUsd);
    const supplyBalance = Number(ethers.formatUnits(user.currentATokenBalance, decimals));
    const stableDebt = Number(ethers.formatUnits(user.currentStableDebt, decimals));
    const variableDebt = Number(ethers.formatUnits(user.currentVariableDebt, decimals));
    const supplyApy = rayToApr(data.liquidityRate);
    const borrowApr = variableDebt > 0 ? rayToApr(data.variableBorrowRate) : rayToApr(user.stableBorrowRate);

    if (supplyBalance > 0.0000001) {
      const valueUsd = supplyBalance * price;
      const daily = dailyUsd(valueUsd, supplyApy);
      assetsUsd += valueUsd;
      supplyDaily += daily;
      supplies.push({
        network: aaveMarket.label,
        symbol,
        balance: supplyBalance,
        valueUsd,
        supplyApy,
        daily,
      });
    }

    const totalDebt = stableDebt + variableDebt;
    if (totalDebt > 0.0000001) {
      const valueUsd = totalDebt * price;
      const daily = dailyUsd(valueUsd, borrowApr);
      debtUsd += valueUsd;
      borrowDaily += daily;
      borrows.push({
        network: aaveMarket.label,
        symbol,
        balance: totalDebt,
        valueUsd,
        borrowApr,
        daily,
      });
    }
  }

  let healthFactor = NaN;
  let accountCollateralUsd = 0;
  let accountDebtUsd = 0;
  if (account) {
    accountCollateralUsd = Number(ethers.formatUnits(account.totalCollateralBase, 8));
    accountDebtUsd = Number(ethers.formatUnits(account.totalDebtBase, 8));
    healthFactor =
      account.healthFactor >= ethers.parseUnits("1000000", 18)
        ? Infinity
        : Number(ethers.formatUnits(account.healthFactor, 18));
  }

  return {
    supplies,
    borrows,
    assetsUsd: assetsUsd || accountCollateralUsd,
    debtUsd: debtUsd || accountDebtUsd,
    daily: supplyDaily - borrowDaily,
    supplyDaily,
    borrowDaily,
    healthFactor,
  };
}

function decodeMulticallResult(iface, fnName, result) {
  if (!result?.success || result.returnData === "0x") return null;
  return iface.decodeFunctionResult(fnName, result.returnData);
}

async function getAaveV4AssetRates(provider, hubAddress, assetId, rateCache) {
  const key = `${hubAddress.toLowerCase()}-${assetId}`;
  if (rateCache.has(key)) return rateCache.get(key);
  const hub = new ethers.Contract(hubAddress, ABIS.aaveV4Hub, provider);
  const [drawnRate, totalOwed, liquidity, asset] = await Promise.all([
    hub.getAssetDrawnRate(assetId),
    hub.getAssetTotalOwed(assetId),
    hub.getAssetLiquidity(assetId),
    hub.getAsset(assetId),
  ]);
  const borrowApr = rayToApr(drawnRate);
  const poolTotal = Number(totalOwed) + Number(liquidity);
  const utilization = poolTotal > 0 ? Number(totalOwed) / poolTotal : 0;
  const fee = Number(asset.liquidityFee) / 10000;
  const supplyApr = borrowApr * utilization * (1 - fee);
  const entry = { borrowApr, supplyApr };
  rateCache.set(key, entry);
  return entry;
}

async function loadAaveV4Ethereum(address, market) {
  const provider = await getNetworkProvider(CONFIG.aaveV4.network);
  const networkConfig = CONFIG.networks[CONFIG.aaveV4.network];
  const rateCache = new Map();
  const spokeIface = new ethers.Interface(ABIS.aaveV4Spoke);
  const vaultIface = new ethers.Interface(ABIS.aaveV4Vault);
  const supplies = [];
  const borrows = [];
  let assetsUsd = 0;
  let debtUsd = 0;
  let supplyDaily = 0;
  let borrowDaily = 0;
  const healthFactors = [];

  for (const spokeConfig of CONFIG.aaveV4.lendingSpokes) {
    const spokeAddress = spokeConfig.address;
    const accountResult = decodeMulticallResult(
      spokeIface,
      "getUserAccountData",
      (
        await multicall(
          [
            {
              target: spokeAddress,
              allowFailure: true,
              callData: spokeIface.encodeFunctionData("getUserAccountData", [address]),
            },
          ],
          provider,
        )
      )[0],
    );
    if (!accountResult) continue;
    const account = accountResult[0];
    const activeCollateralCount = Number(account.activeCollateralCount);
    const borrowCount = Number(account.borrowCount);
    if (activeCollateralCount === 0 && borrowCount === 0) continue;

    if (borrowCount > 0) {
      const hf = Number(ethers.formatUnits(account.healthFactor, 18));
      if (Number.isFinite(hf)) healthFactors.push(hf);
    }

    const countResult = decodeMulticallResult(
      spokeIface,
      "getReserveCount",
      (
        await multicall(
          [
            {
              target: spokeAddress,
              allowFailure: true,
              callData: spokeIface.encodeFunctionData("getReserveCount", []),
            },
          ],
          provider,
        )
      )[0],
    );
    if (!countResult) continue;
    const reserveCount = Number(countResult[0]);
    const reserveCalls = [];
    for (let i = 0; i < reserveCount; i += 1) {
      reserveCalls.push(
        {
          target: spokeAddress,
          allowFailure: true,
          callData: spokeIface.encodeFunctionData("getReserve", [i]),
        },
        {
          target: spokeAddress,
          allowFailure: true,
          callData: spokeIface.encodeFunctionData("getUserSuppliedAssets", [i, address]),
        },
        {
          target: spokeAddress,
          allowFailure: true,
          callData: spokeIface.encodeFunctionData("getUserTotalDebt", [i, address]),
        },
      );
    }

    const reserveResults = [];
    for (let i = 0; i < reserveCalls.length; i += 150) {
      const chunk = await multicall(reserveCalls.slice(i, i + 150), provider);
      reserveResults.push(...chunk);
    }

    const activeAssets = [];
    for (let i = 0; i < reserveCount; i += 1) {
      const reserve = decodeMulticallResult(spokeIface, "getReserve", reserveResults[i * 3])?.[0];
      const suppliedRaw = decodeMulticallResult(spokeIface, "getUserSuppliedAssets", reserveResults[i * 3 + 1])?.[0];
      const debtRaw = decodeMulticallResult(spokeIface, "getUserTotalDebt", reserveResults[i * 3 + 2])?.[0];
      if (!reserve || (!suppliedRaw && !debtRaw)) continue;
      if ((suppliedRaw || 0n) <= 0n && (debtRaw || 0n) <= 0n) continue;
      activeAssets.push({
        reserve,
        suppliedRaw: suppliedRaw || 0n,
        debtRaw: debtRaw || 0n,
      });
    }
    if (!activeAssets.length) continue;

    const tokenMeta = await multicallTokenMeta(
      activeAssets.map(({ reserve }) => reserve.underlying),
      provider,
    );
    const networkPrices = await fetchOnchainTokenPrices(
      networkConfig.geckoNetwork,
      activeAssets.map(({ reserve }) => reserve.underlying.toLowerCase()),
      market,
    );

    for (let i = 0; i < activeAssets.length; i += 1) {
      const { reserve, suppliedRaw, debtRaw } = activeAssets[i];
      const meta = tokenMeta[i];
      const asset = reserve.underlying.toLowerCase();
      const decimals = meta?.decimals ?? Number(reserve.decimals) ?? 18;
      const symbol = meta?.symbol || "TOKEN";
      const price =
        networkPrices[asset] ||
        market.tokenPrices[asset] ||
        fallbackTokenPrice(asset, symbol, market.ethUsd, market.wstEthUsd);
      const rates = await getAaveV4AssetRates(provider, reserve.hub, reserve.assetId, rateCache);
      const networkLabel = `Aave v4 ${spokeConfig.label}`;

      const supplyBalance = Number(ethers.formatUnits(suppliedRaw, decimals));
      if (supplyBalance > 0.0000001) {
        const valueUsd = supplyBalance * price;
        const isWstEth = asset === CONFIG.spark.wstEth;
        let supplyApy = rates.supplyApr;
        let daily = dailyUsd(valueUsd, supplyApy);
        let note = "";
        if (isWstEth && Number.isFinite(market.lidoApr)) {
          supplyApy += market.lidoApr;
          daily += dailyUsd(valueUsd, market.lidoApr);
          note = `Includes Lido ${fmtPct(market.lidoApr)}`;
        }
        assetsUsd += valueUsd;
        supplyDaily += daily;
        supplies.push({
          network: networkLabel,
          symbol,
          balance: supplyBalance,
          valueUsd,
          supplyApy,
          daily,
          note,
        });
      }

      const totalDebt = Number(ethers.formatUnits(debtRaw, decimals));
      if (totalDebt > 0.0000001) {
        const valueUsd = totalDebt * price;
        const daily = dailyUsd(valueUsd, rates.borrowApr);
        debtUsd += valueUsd;
        borrowDaily += daily;
        borrows.push({
          network: networkLabel,
          symbol,
          balance: totalDebt,
          valueUsd,
          borrowApr: rates.borrowApr,
          daily,
        });
      }
    }
  }

  const vaultBalanceCalls = CONFIG.aaveV4.tokenizationVaults.map((vault) => ({
    target: vault.address,
    allowFailure: true,
    callData: vaultIface.encodeFunctionData("balanceOf", [address]),
  }));
  const vaultBalanceResults = [];
  for (let i = 0; i < vaultBalanceCalls.length; i += 50) {
    const chunk = await multicall(vaultBalanceCalls.slice(i, i + 50), provider);
    vaultBalanceResults.push(...chunk);
  }

  const activeVaults = [];
  for (let i = 0; i < CONFIG.aaveV4.tokenizationVaults.length; i += 1) {
    const shares = decodeMulticallResult(vaultIface, "balanceOf", vaultBalanceResults[i])?.[0];
    if (shares > 0n) activeVaults.push({ vault: CONFIG.aaveV4.tokenizationVaults[i], shares });
  }

  if (activeVaults.length) {
    const detailCalls = activeVaults.flatMap(({ vault, shares }) => [
      {
        target: vault.address,
        allowFailure: true,
        callData: vaultIface.encodeFunctionData("convertToAssets", [shares]),
      },
      {
        target: vault.address,
        allowFailure: true,
        callData: vaultIface.encodeFunctionData("asset", []),
      },
      {
        target: vault.address,
        allowFailure: true,
        callData: vaultIface.encodeFunctionData("hub", []),
      },
      {
        target: vault.address,
        allowFailure: true,
        callData: vaultIface.encodeFunctionData("assetId", []),
      },
      {
        target: vault.address,
        allowFailure: true,
        callData: vaultIface.encodeFunctionData("decimals", []),
      },
    ]);
    const detailResults = [];
    for (let i = 0; i < detailCalls.length; i += 50) {
      const chunk = await multicall(detailCalls.slice(i, i + 50), provider);
      detailResults.push(...chunk);
    }

    const underlyingAddresses = [];
    for (let i = 0; i < activeVaults.length; i += 1) {
      const asset = decodeMulticallResult(vaultIface, "asset", detailResults[i * 5 + 1])?.[0];
      if (asset) underlyingAddresses.push(asset);
    }
    const tokenMeta = await multicallTokenMeta(underlyingAddresses, provider);
    const networkPrices = await fetchOnchainTokenPrices(
      networkConfig.geckoNetwork,
      underlyingAddresses.map((token) => token.toLowerCase()),
      market,
    );

    for (let i = 0; i < activeVaults.length; i += 1) {
      const { vault } = activeVaults[i];
      const assetsRaw = decodeMulticallResult(vaultIface, "convertToAssets", detailResults[i * 5])?.[0];
      const underlying = decodeMulticallResult(vaultIface, "asset", detailResults[i * 5 + 1])?.[0];
      const hub = decodeMulticallResult(vaultIface, "hub", detailResults[i * 5 + 2])?.[0];
      const assetId = decodeMulticallResult(vaultIface, "assetId", detailResults[i * 5 + 3])?.[0];
      const decimals = Number(decodeMulticallResult(vaultIface, "decimals", detailResults[i * 5 + 4])?.[0] ?? 18);
      if (!assetsRaw || !underlying || !hub) continue;

      const asset = underlying.toLowerCase();
      const meta = tokenMeta[i];
      const symbol = meta?.symbol || "TOKEN";
      const price =
        networkPrices[asset] ||
        market.tokenPrices[asset] ||
        fallbackTokenPrice(asset, symbol, market.ethUsd, market.wstEthUsd);
      const supplyBalance = Number(ethers.formatUnits(assetsRaw, decimals));
      if (supplyBalance <= 0.0000001) continue;

      const rates = await getAaveV4AssetRates(provider, hub, assetId, rateCache);
      const valueUsd = supplyBalance * price;
      const isWstEth = asset === CONFIG.spark.wstEth;
      let supplyApy = rates.supplyApr;
      let daily = dailyUsd(valueUsd, supplyApy);
      let note = "";
      if (isWstEth && Number.isFinite(market.lidoApr)) {
        supplyApy += market.lidoApr;
        daily += dailyUsd(valueUsd, market.lidoApr);
        note = `Includes Lido ${fmtPct(market.lidoApr)}`;
      }
      assetsUsd += valueUsd;
      supplyDaily += daily;
      supplies.push({
        network: `Aave v4 ${vault.label}`,
        symbol,
        balance: supplyBalance,
        valueUsd,
        supplyApy,
        daily,
        note,
      });
    }
  }

  return {
    supplies,
    borrows,
    assetsUsd,
    debtUsd,
    daily: supplyDaily - borrowDaily,
    supplyDaily,
    borrowDaily,
    healthFactor: healthFactors.length ? Math.min(...healthFactors) : NaN,
  };
}

async function multicallSparkUserData(dataProviderAddress, reserves, userAddress, provider) {
  const iface = new ethers.Interface(ABIS.protocolDataProvider);
  const results = await multicall(
    reserves.map((reserve) => ({
      target: dataProviderAddress,
      allowFailure: true,
      callData: iface.encodeFunctionData("getUserReserveData", [reserve.tokenAddress, userAddress]),
    })),
    provider,
  );
  return results.map((result) => {
    if (!result.success || result.returnData === "0x") return null;
    return iface.decodeFunctionResult("getUserReserveData", result.returnData);
  });
}

async function multicallSparkReserveRates(dataProviderAddress, reserves, provider) {
  const iface = new ethers.Interface(ABIS.protocolDataProvider);
  const results = await multicall(
    reserves.map((reserve) => ({
      target: dataProviderAddress,
      allowFailure: true,
      callData: iface.encodeFunctionData("getReserveData", [reserve.tokenAddress]),
    })),
    provider,
  );
  return results.map((result) => {
    if (!result.success || result.returnData === "0x") return null;
    return iface.decodeFunctionResult("getReserveData", result.returnData);
  });
}

async function multicallTokenMeta(tokenAddresses, provider) {
  const iface = new ethers.Interface(ABIS.erc20);
  const calls = tokenAddresses.flatMap((tokenAddress) => [
    {
      target: tokenAddress,
      allowFailure: true,
      callData: iface.encodeFunctionData("symbol", []),
    },
    {
      target: tokenAddress,
      allowFailure: true,
      callData: iface.encodeFunctionData("decimals", []),
    },
  ]);
  const results = await multicall(calls, provider);
  const meta = [];
  for (let i = 0; i < tokenAddresses.length; i += 1) {
    const symbolResult = results[i * 2];
    const decimalsResult = results[i * 2 + 1];
    const symbol =
      symbolResult?.success && symbolResult.returnData !== "0x"
        ? iface.decodeFunctionResult("symbol", symbolResult.returnData)[0]
        : "TOKEN";
    const decimals =
      decimalsResult?.success && decimalsResult.returnData !== "0x"
        ? Number(iface.decodeFunctionResult("decimals", decimalsResult.returnData)[0])
        : 18;
    meta.push({ symbol, decimals });
  }
  return meta;
}

async function multicall(calls, provider) {
  const contract = new ethers.Contract(CONFIG.multicall3, ABIS.multicall3, provider);
  return contract.aggregate3.staticCall(calls);
}

async function loadUniswap(address, market, network = "ethereum", networkTokenPrices = {}) {
  if (address === ethers.ZeroAddress) return emptyUniswap();
  const config = CONFIG.uniswap[network];
  const provider = await getNetworkProvider(network);
  const nft = new ethers.Contract(config.positionManager, ABIS.nft, provider);
  const factory = new ethers.Contract(config.factory, ABIS.factory, provider);
  const count = Number(await nft.balanceOf(address));
  if (count === 0) {
    state.timestamps[network === "unichain" ? "unichain" : "uniswap"] = new Date();
    return emptyUniswap();
  }
  const tokenIds = await discoverUniswapPositionIds(address, count, provider, network);
  const positions = [];
  const iface = new ethers.Interface(ABIS.nft);
  const batchedCalls = [];
  for (const tokenId of tokenIds) {
    batchedCalls.push({
      target: config.positionManager,
      allowFailure: true,
      callData: iface.encodeFunctionData("positions", [tokenId]),
    });
  }
  const batchedResults = [];
  for (let i = 0; i < batchedCalls.length; i += 50) {
    const chunk = await multicall(batchedCalls.slice(i, i + 50), provider);
    batchedResults.push(...chunk);
  }

  for (let idx = 0; idx < tokenIds.length; idx += 1) {
    const tokenId = tokenIds[idx];
    const callResult = batchedResults[idx];
    if (!callResult?.success || !callResult.returnData || callResult.returnData === "0x") continue;
    const decoded = iface.decodeFunctionResult("positions", callResult.returnData);
    const raw = {
      token0: decoded[2],
      token1: decoded[3],
      fee: decoded[4],
      tickLower: decoded[5],
      tickUpper: decoded[6],
      liquidity: decoded[7],
      tokensOwed0: decoded[10],
      tokensOwed1: decoded[11],
    };
    if (raw.liquidity === 0n && raw.tokensOwed0 === 0n && raw.tokensOwed1 === 0n) continue;

    const [meta0, meta1] = await Promise.all([loadTokenMeta(raw.token0, provider), loadTokenMeta(raw.token1, provider)]);
    const poolAddress = await factory.getPool(raw.token0, raw.token1, raw.fee);
    const uniPool = new ethers.Contract(poolAddress, ABIS.uniPool, provider);
    const [slot0, poolLiquidity, feeQuote, tokenPriceQuote] = await Promise.all([
      uniPool.slot0(),
      uniPool.liquidity(),
      fetchPoolFeeData(poolAddress, Number(raw.fee), config.geckoNetwork),
      fetchOnchainTokenPrices(config.geckoNetwork, [raw.token0, raw.token1]),
    ]);

    const poolPrices = getPoolTokenPrices(feeQuote, raw.token0, raw.token1);
    const mergedTokenPrices = { ...networkTokenPrices, ...tokenPriceQuote };
    const price0 = tokenUsdPrice(raw.token0, meta0, market, poolPrices, mergedTokenPrices);
    const price1 = tokenUsdPrice(raw.token1, meta1, market, poolPrices, mergedTokenPrices);
    const amounts = amountsForLiquidity(Number(raw.liquidity), Number(slot0.tick), Number(raw.tickLower), Number(raw.tickUpper));
    const amount0 = amounts.amount0 / 10 ** meta0.decimals;
    const amount1 = amounts.amount1 / 10 ** meta1.decimals;
    const valueUsd = amount0 * price0 + amount1 * price1;
    if (isSuspiciousTokenSymbol(meta0.symbol) || isSuspiciousTokenSymbol(meta1.symbol)) continue;
    const trusted0 = hasQuotedTokenPrice(raw.token0, poolPrices, mergedTokenPrices, market);
    const trusted1 = hasQuotedTokenPrice(raw.token1, poolPrices, mergedTokenPrices, market);
    if (!trusted0 || !trusted1) continue;
    if (!Number.isFinite(valueUsd) || valueUsd < 0.01) continue;
    const fees = await estimateUnclaimedFees(nft, tokenId, address, raw, meta0, meta1, price0, price1);
    const inRange = Number(slot0.tick) >= Number(raw.tickLower) && Number(slot0.tick) <= Number(raw.tickUpper);
    const liquidityShare = Number(poolLiquidity) > 0 ? Number(raw.liquidity) / Number(poolLiquidity) : 0;
    const avgDailyVolumeUsd = feeQuote.volume7dUsd > 0 ? feeQuote.volume7dUsd / 7 : feeQuote.volume24hUsd || 0;
    const poolDailyFeesUsd = avgDailyVolumeUsd * (Number(raw.fee) / 1_000_000);
    const estimatedDailyFees = inRange ? poolDailyFeesUsd * liquidityShare : 0;
    const fallbackApr =
      feeQuote.reserveUsd > 0 ? (poolDailyFeesUsd * 365 * 100) / feeQuote.reserveUsd : NaN;
    const feeApr =
      valueUsd > 0 && estimatedDailyFees > 0
        ? (estimatedDailyFees * 365 * 100) / valueUsd
        : inRange && Number.isFinite(fallbackApr)
          ? fallbackApr
          : 0;

    positions.push({
      tokenId: tokenId.toString(),
      network: config.label,
      pair: `${meta0.symbol}/${meta1.symbol}`,
      feeTier: Number(raw.fee) / 10000,
      tick: Number(slot0.tick),
      tickLower: Number(raw.tickLower),
      tickUpper: Number(raw.tickUpper),
      inRange,
      valueUsd,
      unclaimedFeesUsd: fees.usd,
      feeApr,
      daily: estimatedDailyFees,
      avgDailyVolumeUsd,
      poolDailyFeesUsd,
      poolAddress,
      volume7dUsd: feeQuote.volume7dUsd,
      il: NaN,
      ilNote: "Needs mint history",
      liquidityShare,
    });
  }

  state.timestamps[network === "unichain" ? "unichain" : "uniswap"] = new Date();
  return {
    positions,
    assetsUsd: positions.reduce((sum, position) => sum + position.valueUsd + position.unclaimedFeesUsd, 0),
    daily: positions.reduce((sum, position) => sum + position.daily, 0),
  };
}

function normalizeRevertDetail(detail, currentPosition = {}) {
  if (!detail || typeof detail !== "object") return null;
  const payload = detail.data && typeof detail.data === "object" ? detail.data : detail;
  const performance = payload.performance?.hodl || payload.performance || {};
  const valueUsdBase = Number(currentPosition.valueUsd || payload.underlying_value || payload.amountUSD || 0);
  const feeAprRaw = Number(performance.fee_apr ?? performance.feeAPR ?? 0);
  const feeApr = Number.isFinite(feeAprRaw) ? feeAprRaw : 0;
  const inRange = currentPosition.inRange !== false;
  const daily = inRange && Number.isFinite(feeApr) && feeApr >= 0 && feeApr < 100000
    ? dailyUsd(valueUsdBase, feeApr)
    : 0;
  const il = Number(performance.il);
  const detailValue = numeric(payload.underlying_value, payload.amountUSD, payload.valueUSD, payload.amount_usd);
  return {
    unclaimedFeesUsd: numeric(payload.fees_value),
    feeApr,
    daily,
    poolPnlUsd: numeric(performance.pool_pnl),
    totalPnlUsd: numeric(performance.pnl),
    il: Number.isFinite(il) ? il : NaN,
    ilNote: Number.isFinite(il) ? `${fmtPct(il)} IL` : currentPosition.ilNote || "Needs mint history",
    valueUsd: Number.isFinite(detailValue) && detailValue > 0 ? detailValue : undefined,
  };
}

async function loadRevertPositionDetail(position) {
  const nftId = String(position.tokenId || "");
  if (!nftId || !/^\d+$/.test(nftId)) return null;
  const network = String(position.network || "").toLowerCase().includes("bnb")
    ? "bnb"
    : String(position.network || "").toLowerCase().includes("unichain")
      ? "unichain"
      : "mainnet";
  let exchange = String(position.exchange || "").toLowerCase();
  if (!exchange) exchange = position.protocol === "v4" ? "uniswapv4" : position.protocol === "v2" ? "uniswapv2" : "uniswapv3";
  if (exchange.includes("uniswap")) {
    exchange = position.protocol === "v4" ? "uniswapv4" : position.protocol === "v2" ? "uniswapv2" : "uniswapv3";
  }
  const params = new URLSearchParams({ network, exchange, nftId });
  try {
    const detail = await fetchJson(`${CONFIG.revertPositionDetailUrl}?${params}`, { timeoutMs: 10000, cache: "no-cache" });
    return normalizeRevertDetail(detail, position);
  } catch {
    return null;
  }
}

async function enrichPositionMetrics(positions) {
  const targets = positions.filter((p) => (p.protocol === "v3" || p.protocol === "v4") && /^\d+$/.test(String(p.tokenId || "")));
  const details = await Promise.all(targets.map((p) => loadRevertPositionDetail(p)));
  const detailMap = new Map();
  targets.forEach((position, idx) => {
    if (details[idx]) detailMap.set(`${position.network}:${position.protocol}:${position.tokenId}`, details[idx]);
  });
  return positions.map((position) => {
    const key = `${position.network}:${position.protocol}:${position.tokenId}`;
    const detail = detailMap.get(key);
    if (!detail) return position;
    const mergedFees = Math.max(Number(position.unclaimedFeesUsd || 0), Number(detail.unclaimedFeesUsd || 0));
    return {
      ...position,
      unclaimedFeesUsd: Number.isFinite(mergedFees) ? mergedFees : Number(position.unclaimedFeesUsd || 0),
      feeApr: Number.isFinite(detail.feeApr) && detail.feeApr > 0 ? detail.feeApr : position.feeApr,
      daily: Number.isFinite(detail.daily) && detail.daily >= 0 ? detail.daily : position.daily,
      poolPnlUsd: Number.isFinite(detail.poolPnlUsd) ? detail.poolPnlUsd : position.poolPnlUsd,
      totalPnlUsd: Number.isFinite(detail.totalPnlUsd) ? detail.totalPnlUsd : position.totalPnlUsd ?? position.pnlUsd,
      pnlUsd: Number.isFinite(detail.poolPnlUsd) ? detail.poolPnlUsd : position.pnlUsd,
      il: Number.isFinite(detail.il) ? detail.il : position.il,
      ilNote: detail.ilNote || position.ilNote,
      valueUsd: Number.isFinite(detail.valueUsd) && detail.valueUsd > 0 ? detail.valueUsd : position.valueUsd,
      source: "Revert",
    };
  });
}

async function loadLiquidityPools(address, market, options = {}) {
  if (address === ethers.ZeroAddress) return emptyUniswap();
  let positions = [];
  let failedScans = [];
  const isStatusBar = !!options.statusBar;

  const buildResult = (source = "Revert") => ({
    positions,
    assetsUsd: positions.reduce((sum, position) => sum + position.valueUsd + position.unclaimedFeesUsd, 0),
    daily: positions.reduce((sum, position) => sum + position.daily, 0),
    source,
    failedScans,
    scanProgress: { completed: 0, total: 2 },
  });

  const emitPartial = (completed, source = "Revert") => {
    if (typeof options.onPartial !== "function") return;
    options.onPartial({
      ...buildResult(source),
      scanProgress: { completed, total: 2 },
    });
  };

  const selfV3Promise = withTimeout(loadSelfV3Positions(address, market), isStatusBar ? 6000 : 8000, "On-chain V3 scan").catch(() => ({
    positions: [],
  }));
  const selfV4Promise = withTimeout(loadUniswapV4(address, market), isStatusBar ? 8000 : 15000, "On-chain V4 scan").catch(() => ({
    positions: [],
  }));
  const selfV2WalletPromise = withTimeout(loadSelfV2WalletPositions(address, market), isStatusBar ? 5000 : 6000, "On-chain V2 wallet scan").catch(() => ({
    positions: [],
  }));
  const selfV2StakedPromise = withTimeout(loadSelfV2StakedPositions(address, market), isStatusBar ? 20000 : 120000, "V2 staked scan").catch(() => ({
    positions: [],
  }));
  const accountRevertPromise = withTimeout(loadRevertAccountPositions(address, market), isStatusBar ? 8000 : 12000, "Revert account positions").catch(
    () => [],
  );
  const globalRevertPromise = withTimeout(loadRevertGlobalPositions(address, market), isStatusBar ? 8000 : 12000, "Revert global positions").catch(
    () => [],
  );

  const [accountRevert, globalRevert] = await Promise.all([accountRevertPromise, globalRevertPromise]);
  const revertPositions = mergePositions([...accountRevert, ...globalRevert]);
  if (revertPositions.length > 0) {
    positions = mergePositions([...positions, ...revertPositions]);
    emitPartial(1, "Revert");
  }

  const [selfV3Result, selfV4Result, selfV2WalletResult] = await Promise.all([selfV3Promise, selfV4Promise, selfV2WalletPromise]);
  const onchainBatch = mergePositions([
    ...(selfV3Result.positions || []),
    ...(selfV4Result.positions || []),
    ...(selfV2WalletResult.positions || []),
  ]);
  const supplementalOnchain = filterOnchainPositionsNotInRevert(onchainBatch, revertPositions);
  positions = mergePositions([...positions, ...supplementalOnchain]);
  positions.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  const buildFinal = (sourceLabel) => ({
    positions,
    assetsUsd: positions.reduce((sum, position) => sum + position.valueUsd + position.unclaimedFeesUsd, 0),
    daily: positions.reduce((sum, position) => sum + position.daily, 0),
    source: sourceLabel,
    failedScans,
    scanProgress: { completed: 2, total: 2 },
  });

  const hasOnchain = positions.some((position) => position.source === "On-chain");
  const preV2Result = buildFinal(hasOnchain ? "Revert + On-chain" : "Revert");
  if (typeof options.onPartial === "function") options.onPartial(preV2Result);

  const selfV2StakedResult = await selfV2StakedPromise;
  if ((selfV2StakedResult.positions || []).length > 0) {
    positions = mergePositions([...positions, ...(selfV2StakedResult.positions || [])]);
  }

  positions = await enrichPositionMetrics(positions);
  positions.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  state.timestamps.liquidity = new Date();
  const finalResult = buildFinal("Revert + On-chain");
  if (typeof options.onPartial === "function") options.onPartial(finalResult);
  return finalResult;
}

async function fetchRevertPositions(url) {
  try {
    return await fetchJson(url, { timeoutMs: 8000, cache: "no-cache" });
  } catch {
    await delay(400);
    return await fetchJson(url, { timeoutMs: 8000, cache: "no-cache" });
  }
}

async function loadRevertAccountPositions(address, market) {
  const params = new URLSearchParams({ account: address, limit: "500" });
  const result = await fetchRevertPositions(`${CONFIG.revertAccountPositionsUrl}?${params}`);
  const rawPositions = Array.isArray(result) ? result : result.positions || result.data || [];
  return rawPositions
    .map((position) => normalizeRevertPosition(position, market, position.network || "mainnet", position.exchange || ""))
    .filter(Boolean);
}

async function loadRevertGlobalPositions(address, market) {
  const params = new URLSearchParams({ account: address, limit: "500" });
  const result = await fetchRevertPositions(`${CONFIG.revertPositionsUrl}?${params}`);
  const rawPositions = Array.isArray(result) ? result : result.positions || result.data || [];
  return rawPositions
    .map((position) => normalizeRevertPosition(position, market, position.network || "mainnet", position.exchange || ""))
    .filter(Boolean);
}

async function loadSelfV2StakedPositions(address, market) {
  const data = await fetchJson(`${CONFIG.v2LpUrl}?account=${address}`, { timeoutMs: 110000, cache: "no-cache" });
  const rows = Array.isArray(data.positions) ? data.positions : [];
  const provider = await getNetworkProvider("ethereum");
  const positions = [];

  for (const row of rows) {
    try {
      const token0 = String(row.token0 || "").toLowerCase();
      const token1 = String(row.token1 || "").toLowerCase();
      const pairAddress = String(row.pairAddress || "").toLowerCase();
      if (!token0 || !token1 || !pairAddress) continue;

      const amount0 = Number(row.amount0 || 0);
      const amount1 = Number(row.amount1 || 0);
      let valueUsd = Number(row.valueUsd || 0);
      if (!Number.isFinite(valueUsd) || valueUsd <= 0) {
        const priceQuote = await fetchOnchainTokenPrices("eth", [token0, token1]);
        const [meta0, meta1] = await Promise.all([loadTokenMeta(token0, provider), loadTokenMeta(token1, provider)]);
        const price0 = tokenUsdPrice(token0, meta0, market, {}, priceQuote);
        const price1 = tokenUsdPrice(token1, meta1, market, {}, priceQuote);
        valueUsd = amount0 * price0 + amount1 * price1;
      }
      if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;

      positions.push({
        tokenId: `v2:${pairAddress}:${address.toLowerCase()}`,
        network: "Ethereum Uniswap",
        pair: normalizePairName(row.pair || (row.symbol0 && row.symbol1 ? `${row.symbol0}/${row.symbol1}` : "V2 LP")),
        protocol: "v2",
        exchange: "Uniswap",
        feeTier: 0.3,
        tick: null,
        tickLower: null,
        tickUpper: null,
        inRange: true,
        valueUsd,
        pnlUsd: NaN,
        poolPnlUsd: NaN,
        totalPnlUsd: NaN,
        unclaimedFeesUsd: 0,
        stakingRewardsUsd: 0,
        feeApr: numeric(row.feeApr),
        daily: numeric(row.daily),
        avgDailyVolumeUsd: numeric(row.avgDailyVolumeUsd),
        poolDailyFeesUsd: numeric(row.poolDailyFeesUsd),
        poolAddress: pairAddress,
        volume7dUsd: 0,
        il: NaN,
        ilNote: row.ilNote || "V2 fees compound in pool",
        liquidityShare: Number(row.share || 0),
        source: "On-chain",
      });
    } catch {
      // skip malformed rows
    }
  }

  return { positions: mergePositions(positions) };
}

async function loadSelfV3Positions(address, market) {
  const networks = ["ethereum", "bnb", "unichain"].filter((network) => CONFIG.uniswap[network] && CONFIG.networks[network]);
  const results = await settleWithConcurrency(networks, 3, async (network) => {
    const data = await loadUniswap(address, market, network);
    return (data.positions || []).map((position) => ({
      ...position,
      protocol: "v3",
      network: position.network.replace(/ Uniswap V3$/, " Uniswap"),
      source: "On-chain",
      ilNote: position.ilNote || "On-chain estimate",
    }));
  });
  const positions = results.filter((row) => row.status === "fulfilled").flatMap((row) => row.value || []);
  return { positions: mergePositions(positions) };
}

async function loadUniswapV4(_address, _market) {
  // V4 on-chain USD needs pool slot data; rely on Revert until that is wired.
  return { positions: [] };
}

async function loadSelfV2WalletPositions(address, market) {
  const baseUrl = BLOCKSCOUT_BASES.ethereum;
  if (!baseUrl) return { positions: [] };
  const data = await fetchJsonWithRetry(`${baseUrl}/api/v2/addresses/${address}/tokens?type=ERC-20`, { timeoutMs: 9000, cache: "no-cache" }, 1);
  const items = Array.isArray(data.items) ? data.items : [];
  const lpItems = items.filter((item) => {
    const token = item.token || {};
    const symbol = String(token.symbol || "").toUpperCase();
    const name = String(token.name || "").toUpperCase();
    if (token.type !== "ERC-20") return false;
    if (!(symbol.includes("UNI-V2") || name.includes("UNI-V2") || symbol.includes("SLP"))) return false;
    const decimals = Number(token.decimals || 18);
    const balance = Number(item.value || 0) / 10 ** decimals;
    return Number.isFinite(balance) && balance > 0;
  });
  if (!lpItems.length) return { positions: [] };

  const provider = await getNetworkProvider("ethereum");
  const positions = [];
  for (const item of lpItems.slice(0, 20)) {
    try {
      const token = item.token || {};
      const pairAddress = String(token.address_hash || "").toLowerCase();
      if (!pairAddress) continue;
      const lpDecimals = Number(token.decimals || 18);
      const userLpBalance = Number(item.value || 0) / 10 ** lpDecimals;
      if (!Number.isFinite(userLpBalance) || userLpBalance <= 0) continue;

      const pair = new ethers.Contract(pairAddress, ABIS.uniV2Pair, provider);
      const [token0Address, token1Address, reserves, totalSupplyRaw] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.totalSupply(),
      ]);
      const totalSupply = Number(totalSupplyRaw) / 10 ** lpDecimals;
      if (!Number.isFinite(totalSupply) || totalSupply <= 0) continue;
      const share = userLpBalance / totalSupply;
      if (!Number.isFinite(share) || share <= 0) continue;

      const [meta0, meta1] = await Promise.all([loadTokenMeta(token0Address, provider), loadTokenMeta(token1Address, provider)]);
      const priceQuote = await fetchOnchainTokenPrices("eth", [token0Address, token1Address]);
      const price0 = tokenUsdPrice(token0Address, meta0, market, {}, priceQuote);
      const price1 = tokenUsdPrice(token1Address, meta1, market, {}, priceQuote);
      const amount0 = (Number(reserves.reserve0) / 10 ** meta0.decimals) * share;
      const amount1 = (Number(reserves.reserve1) / 10 ** meta1.decimals) * share;
      const valueUsd = amount0 * price0 + amount1 * price1;
      if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;

      positions.push({
        tokenId: `v2:${pairAddress}:${address.toLowerCase()}`,
        network: "Ethereum Uniswap",
        pair: `${meta0.symbol}/${meta1.symbol}`,
        protocol: "v2",
        exchange: "Uniswap",
        feeTier: 0.3,
        tick: null,
        tickLower: null,
        tickUpper: null,
        inRange: true,
        valueUsd,
        pnlUsd: NaN,
        poolPnlUsd: NaN,
        totalPnlUsd: NaN,
        unclaimedFeesUsd: 0,
        stakingRewardsUsd: 0,
        feeApr: 0,
        daily: 0,
        avgDailyVolumeUsd: 0,
        poolDailyFeesUsd: 0,
        poolAddress: pairAddress,
        volume7dUsd: 0,
        il: NaN,
        ilNote: "On-chain V2 snapshot",
        liquidityShare: share,
        source: "On-chain",
      });
    } catch {
      // Ignore malformed or non-standard LP token contracts.
    }
  }

  return { positions: mergePositions(positions) };
}

function protocolFromExchange(exchange = "") {
  const value = String(exchange).toLowerCase();
  if (value.includes("v4")) return "v4";
  if (value.includes("v3") || value.includes("aerodrome") || value.includes("pancakeswap")) return "v3";
  if (value.includes("v2") || value.includes("sushiswap")) return "v2";
  return "lp";
}

function isSupportedRevertExchange(exchange = "") {
  const value = String(exchange).toLowerCase();
  if (!value) return true;
  return REVERT_SUPPORTED_EXCHANGE_PREFIXES.some((prefix) => value.includes(prefix));
}

function normalizeRevertPosition(position, market, networkId, exchangeFilter = "") {
  if (position.exited === true) return null;
  const exchange = String(position.exchange || position.protocol || exchangeFilter || "").toLowerCase();
  if (!isSupportedRevertExchange(exchange)) return null;
  const protocol = protocolFromExchange(exchange);
  const pool = position.pool || {};
  const tokenMap = position.tokens || {};
  const token0Address = String(position.token0 || pool.token0?.address || "").toLowerCase();
  const token1Address = String(position.token1 || pool.token1?.address || "").toLowerCase();
  const token0 = pool.token0 || tokenMap[token0Address] || {};
  const token1 = pool.token1 || tokenMap[token1Address] || {};
  pair =
    position.pair ||
    position.poolName ||
    normalizePairName(
      `${token0.symbol || position.token0Symbol || "TOKEN0"}/${token1.symbol || position.token1Symbol || "TOKEN1"}`,
    );
  const valueUsd = numeric(position.amountUSD, position.totalUSD, position.valueUSD, position.amount_usd, position.underlying_value);
  if (!Number.isFinite(valueUsd) || valueUsd <= 0) return null;

  let feeTierRaw = numeric(pool.feeTier, pool.fee, position.feeTier, position.fee, position.fee_tier);
  if (!feeTierRaw && protocol === "v2") feeTierRaw = 3000;
  const feeTier = feeTierRaw > 100 ? feeTierRaw / 10000 : feeTierRaw || 0;
  const unclaimedFeesUsd = numeric(
    position.feesUSD,
    position.uncollectedFeesUSD,
    position.unclaimedFeesUSD,
    position.fees_usd,
    position.unclaimed_rewards,
    position.unclaimedRewards,
  );
  const performance = position.performance?.hodl || position.performance || {};
  const feeAprRaw = numeric(position.apr, position.apy, position.feeAPR, position.feeApr, performance.fee_apr, performance.feeAPR);
  const feeApr = feeAprRaw > 1 ? feeAprRaw : feeAprRaw * 100;
  const dailyFromApr = valueUsd > 0 && Number.isFinite(feeApr) ? dailyUsd(valueUsd, feeApr) : 0;
  const hasTickRange = protocol === "v3" || protocol === "v4";
  const inRange = hasTickRange
    ? position.inRange !== undefined
      ? Boolean(position.inRange)
      : position.in_range !== undefined
        ? Boolean(position.in_range)
        : position.status !== "out-of-range"
    : true;
  const daily = inRange ? numeric(position.feesPerDayUSD, position.dailyFeesUSD, position.fees_per_day_usd, dailyFromApr) : 0;
  const poolAddress =
    (typeof pool === "object" && pool.address) ||
    (typeof position.pool === "string" ? position.pool : "") ||
    position.poolAddress ||
    "—";
  const pnlUsd = numeric(performance.pnl, performance.pool_pnl, position.pnlUSD, position.pnl_usd);
  const stakingRewardsUsd = numeric(position.staking_rewards, position.stakingRewardsUSD, position.stakingRewards);
  const exchangeLabel = exchange.replace("uniswap", "Uniswap").replace("sushiswap", "Sushi").replace("aerodrome", "Aerodrome");

  return {
    tokenId: String(position.id || position.tokenId || position.token_id || position.nft_id || pair),
    network: revertNetworkLabel(networkId),
    pair,
    protocol,
    exchange: exchangeLabel,
    feeTier,
    tick: hasTickRange ? Number(position.tick ?? position.currentTick ?? 0) : null,
    tickLower: hasTickRange ? Number(position.tickLower ?? position.lowerTick ?? position.tick_lower ?? 0) : null,
    tickUpper: hasTickRange ? Number(position.tickUpper ?? position.upperTick ?? position.tick_upper ?? 0) : null,
    inRange,
    valueUsd,
    pnlUsd,
    unclaimedFeesUsd,
    stakingRewardsUsd,
    feeApr: inRange && Number.isFinite(feeApr) ? feeApr : valueUsd > 0 ? (daily * 365 * 100) / valueUsd : 0,
    daily,
    avgDailyVolumeUsd: numeric(position.avgDailyVolumeUSD, position.volumeUSD24h, position.volume24hUSD),
    poolDailyFeesUsd: numeric(position.poolFeesPerDayUSD, position.poolDailyFeesUSD),
    poolAddress,
    volume7dUsd: numeric(position.volume7dUSD, position.volumeUSD7d),
    il: NaN,
    ilNote: Number.isFinite(Number(performance.il)) ? `${fmtPct(Number(performance.il))} IL` : "Needs mint history",
    liquidityShare: numeric(position.liquidityShare, position.poolShare),
    source: "Revert",
  };
}

function revertNetworkIdToKey(networkId) {
  if (networkId === "mainnet") return "ethereum";
  return networkId;
}

function revertNetworkLabel(networkId) {
  const key = revertNetworkIdToKey(networkId);
  const config = CONFIG.revertNetworks.find((network) => network.id === key || network.aliases.includes(networkId));
  return config?.label || `${networkId} LP`;
}

function isSuspiciousTokenSymbol(symbol) {
  const s = String(symbol || "").trim();
  if (!s) return false;
  if (s.includes(":")) return true;
  if (s.length > 16) return true;
  return false;
}

function hasQuotedTokenPrice(address, poolPrices = {}, networkTokenPrices = {}, market = {}) {
  const key = String(address || "").toLowerCase();
  if (Number(poolPrices[key]) > 0 || Number(networkTokenPrices[key]) > 0 || Number(market?.tokenPrices?.[key]) > 0) return true;
  return CONFIG.knownStablecoins.has(key) || CONFIG.knownEthLike.has(key);
}

function positionMergeKey(position) {
  const tokenId = String(position.tokenId || "");
  if (/^\d+$/.test(tokenId)) return `${position.network}:${position.protocol || "v3"}:id:${tokenId}`;
  return `${position.network}:${position.protocol || "lp"}:${tokenId}`;
}

function filterOnchainPositionsNotInRevert(onchainPositions, revertPositions) {
  const revertKeys = new Set(
    revertPositions
      .filter((p) => /^\d+$/.test(String(p.tokenId || "")))
      .map((p) => positionMergeKey(p)),
  );
  return onchainPositions.filter((p) => !revertKeys.has(positionMergeKey(p)));
}

function mergePositions(positions) {
  const merged = new Map();
  for (const position of positions) {
    const fallbackIdentity = [
      String(position.protocol || ""),
      String(position.pair || "").toLowerCase(),
      String(position.feeTier || 0),
      String(position.tickLower ?? ""),
      String(position.tickUpper ?? ""),
    ].join(":");
    const tokenIdentity =
      position.tokenId && position.tokenId !== "revert" ? String(position.tokenId) : `fallback:${fallbackIdentity}`;
    const key = `${position.network}:${position.protocol || "lp"}:${tokenIdentity}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...position });
      continue;
    }
    merged.set(key, {
      ...existing,
      ...position,
      source:
        existing.source === "Revert" || position.source === "Revert"
          ? "Revert"
          : existing.source === "On-chain" || position.source === "On-chain"
            ? "On-chain"
            : (position.source || existing.source),
      valueUsd:
        existing.source === "Revert" && position.source !== "Revert"
          ? Number(existing.valueUsd || 0)
          : position.source === "Revert" && existing.source !== "Revert"
            ? Number(position.valueUsd || 0)
            : Math.max(Number(existing.valueUsd || 0), Number(position.valueUsd || 0)),
      unclaimedFeesUsd: Math.max(Number(existing.unclaimedFeesUsd || 0), Number(position.unclaimedFeesUsd || 0)),
      poolPnlUsd: Number.isFinite(Number(position.poolPnlUsd)) ? Number(position.poolPnlUsd) : existing.poolPnlUsd,
      totalPnlUsd: Number.isFinite(Number(position.totalPnlUsd)) ? Number(position.totalPnlUsd) : existing.totalPnlUsd,
      pnlUsd: Number.isFinite(Number(position.pnlUsd)) ? Number(position.pnlUsd) : existing.pnlUsd,
      feeApr: Number(position.feeApr || 0) > 0 ? Number(position.feeApr || 0) : Number(existing.feeApr || 0),
      daily: Number(position.daily || 0) > 0 ? Number(position.daily || 0) : Number(existing.daily || 0),
      ilNote: position.ilNote && position.ilNote !== "Needs mint history" ? position.ilNote : existing.ilNote,
    });
  }
  return [...merged.values()];
}

function numeric(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function discoverUniswapPositionIds(owner, expectedCount, provider, network = "ethereum", positionManagerOverride = null) {
  const config = CONFIG.uniswap[network];
  const positionManager = positionManagerOverride || config.positionManager;
  const isV4Manager =
    config.v4PositionManager &&
    positionManager.toLowerCase() === String(config.v4PositionManager).toLowerCase();
  const deploymentBlock = isV4Manager
    ? Number(config.v4DeploymentBlock || config.deploymentBlock || 0)
    : Number(config.deploymentBlock || 0);
  const cacheKey = `${network}:${positionManager.toLowerCase()}:${owner.toLowerCase()}`;
  const cached = state.uniswapPositionIdCache.get(cacheKey);
  if (cached && cached.length >= expectedCount) return cached.slice(0, expectedCount);
  if (expectedCount <= 0) return [];

  try {
    const nft = new ethers.Contract(positionManager, ABIS.nft, provider);
    const enumerated = [];
    for (let index = 0; index < expectedCount; index += 1) {
      const tokenId = await nft.tokenOfOwnerByIndex(owner, index);
      enumerated.push(tokenId);
    }
    if (enumerated.length > 0) {
      state.uniswapPositionIdCache.set(cacheKey, enumerated);
      return enumerated;
    }
  } catch {
    // Fallback to transfer-log reconstruction when enumerable API is unavailable.
  }

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const ownerTopic = ethers.zeroPadValue(owner, 32);
  const latest = await provider.getBlockNumber();
  const chunkSize = 250_000;
  const logs = [];

  for (let fromBlock = deploymentBlock; fromBlock <= latest; fromBlock += chunkSize + 1) {
    const toBlock = Math.min(fromBlock + chunkSize, latest);
    const [incoming, outgoing] = await Promise.all([
      getLogsWithRetry(provider, {
        address: positionManager,
        fromBlock,
        toBlock,
        topics: [transferTopic, null, ownerTopic],
      }),
      getLogsWithRetry(provider, {
        address: positionManager,
        fromBlock,
        toBlock,
        topics: [transferTopic, ownerTopic],
      }),
    ]);
    logs.push(...incoming, ...outgoing);
  }

  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.index - b.index;
  });

  const owned = new Set();
  for (const log of logs) {
    const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
    const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);
    const tokenId = BigInt(log.topics[3]).toString();
    if (from.toLowerCase() === owner.toLowerCase()) owned.delete(tokenId);
    if (to.toLowerCase() === owner.toLowerCase()) owned.add(tokenId);
  }

  const tokenIds = [...owned].slice(0, expectedCount).map((tokenId) => BigInt(tokenId));
  if (tokenIds.length === 0 && expectedCount > 0) {
    throw new Error("Could not enumerate Uniswap V3 position NFTs from transfer logs");
  }
  state.uniswapPositionIdCache.set(cacheKey, tokenIds);
  return tokenIds;
}

async function getLogsWithRetry(provider, filter) {
  try {
    return await provider.getLogs(filter);
  } catch (error) {
    const from = Number(filter.fromBlock);
    const to = Number(filter.toBlock);
    if (to <= from) throw error;
    const mid = Math.floor((from + to) / 2);
    const [left, right] = await Promise.all([
      getLogsWithRetry(provider, { ...filter, fromBlock: from, toBlock: mid }),
      getLogsWithRetry(provider, { ...filter, fromBlock: mid + 1, toBlock: to }),
    ]);
    return [...left, ...right];
  }
}

async function loadTokenMeta(address, provider) {
  const token = new ethers.Contract(address, ABIS.erc20, provider);
  const [symbol, decimals] = await Promise.all([token.symbol().catch(() => "TOKEN"), token.decimals().catch(() => 18)]);
  return { symbol, decimals: Number(decimals) };
}

async function estimateUnclaimedFees(nft, tokenId, owner, raw, meta0, meta1, price0, price1) {
  const params = {
    tokenId,
    recipient: owner,
    amount0Max: (1n << 128n) - 1n,
    amount1Max: (1n << 128n) - 1n,
  };
  try {
    const quote = await nft.collect.staticCall(params, { from: owner });
    const amount0 = Number(ethers.formatUnits(quote.amount0, meta0.decimals));
    const amount1 = Number(ethers.formatUnits(quote.amount1, meta1.decimals));
    return { usd: amount0 * price0 + amount1 * price1 };
  } catch {
    const amount0 = Number(ethers.formatUnits(raw.tokensOwed0, meta0.decimals));
    const amount1 = Number(ethers.formatUnits(raw.tokensOwed1, meta1.decimals));
    return { usd: amount0 * price0 + amount1 * price1 };
  }
}

function amountsForLiquidity(liquidity, tick, tickLower, tickUpper) {
  const sqrt = (t) => Math.pow(1.0001, t / 2);
  const sa = sqrt(tickLower);
  const sb = sqrt(tickUpper);
  const sp = sqrt(tick);
  if (tick <= tickLower) return { amount0: liquidity * ((sb - sa) / (sa * sb)), amount1: 0 };
  if (tick >= tickUpper) return { amount0: 0, amount1: liquidity * (sb - sa) };
  return {
    amount0: liquidity * ((sb - sp) / (sp * sb)),
    amount1: liquidity * (sp - sa),
  };
}

async function fetchPoolFeeData(poolAddress, fee, network = "eth") {
  const poolUrl = `${CONFIG.geckoPoolBaseUrl}/${network}/pools/${poolAddress}`;
  try {
    const ohlcv = await fetchJson(`${poolUrl}/ohlcv/day?aggregate=1&limit=7&currency=usd`);
    const rows = ohlcv.data?.attributes?.ohlcv_list || [];
    const volume7dUsd = rows.reduce((sum, row) => sum + Number(row[5] || 0), 0);
    const pool = await fetchJson(poolUrl);
    const h24 = Number(pool.data?.attributes?.volume_usd?.h24 || 0);
    return {
      volume7dUsd,
      volume24hUsd: h24,
      reserveUsd: Number(pool.data?.attributes?.reserve_in_usd || 0),
      pool,
      source: "CoinGecko on-chain OHLCV",
    };
  } catch {
    try {
      const pool = await fetchJson(poolUrl);
      const h24 = Number(pool.data?.attributes?.volume_usd?.h24 || 0);
      return {
        volume7dUsd: h24 * 7,
        volume24hUsd: h24,
        reserveUsd: Number(pool.data?.attributes?.reserve_in_usd || 0),
        pool,
        source: "CoinGecko h24 fallback",
      };
    } catch {
      return { volume7dUsd: 0, volume24hUsd: 0, reserveUsd: 0, source: "Unavailable", fee };
    }
  }
}

function getPoolTokenPrices(feeQuote, token0, token1) {
  const prices = {};
  const pool = feeQuote.pool;
  const baseId = pool?.data?.relationships?.base_token?.data?.id || "";
  const quoteId = pool?.data?.relationships?.quote_token?.data?.id || "";
  const baseAddress = baseId.split("_").pop()?.toLowerCase();
  const quoteAddress = quoteId.split("_").pop()?.toLowerCase();
  const attrs = pool?.data?.attributes || {};
  if (baseAddress) prices[baseAddress] = Number(attrs.base_token_price_usd || 0);
  if (quoteAddress) prices[quoteAddress] = Number(attrs.quote_token_price_usd || 0);
  prices[token0.toLowerCase()] ||= 0;
  prices[token1.toLowerCase()] ||= 0;
  return prices;
}

function tokenUsdPrice(address, meta, market, poolPrices = {}, networkTokenPrices = {}) {
  const key = address.toLowerCase();
  const symbol = String(meta?.symbol || "").toUpperCase();
  const directPrice =
    poolPrices[key] ||
    networkTokenPrices[key] ||
    market.tokenPrices[key] ||
    0;
  if (directPrice > 0) return directPrice;
  return fallbackTokenPrice(key, symbol, market.ethUsd, market.wstEthUsd);
}

const PortfolioCache = {
  SKIP_FETCH_MS: 5 * 60 * 1000,
  BLOCKSCOUT_TTL_MS: 5 * 60 * 1000,
  MAX_ENTRIES: 24,
  // Cap the process-lifetime in-memory maps so a long-running server doesn't grow
  // unbounded with every unique wallet ever queried. LRU by last write.
  MEMORY_MAX: 1000,
  PORTFOLIO_KEY: "bankirr_portfolio_v3",
  BLOCKSCOUT_KEY: "bankirr_blockscout_v2",
  memory: { portfolio: new Map(), blockscout: new Map() },
  inflight: new Map(),

  multiKey(addresses) {
    return addresses.map((a) => a.toLowerCase()).sort().join(",");
  },

  rememberInMemory(map, key, value) {
    if (map.has(key)) map.delete(key); // re-insert to move to most-recent position
    map.set(key, value);
    while (map.size > this.MEMORY_MAX) {
      map.delete(map.keys().next().value); // evict oldest
    }
    return value;
  },

  readStore(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  writeStore(key, data) {
    try {
      const entries = Object.entries(data)
        .sort(([, a], [, b]) => (b.fetchedAt || 0) - (a.fetchedAt || 0))
        .slice(0, this.MAX_ENTRIES);
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // Quota or private mode — memory cache still works.
    }
  },

  getPortfolio(cacheKey) {
    if (this.memory.portfolio.has(cacheKey)) return this.memory.portfolio.get(cacheKey);
    const stored = this.readStore(this.PORTFOLIO_KEY)[cacheKey];
    if (stored) this.rememberInMemory(this.memory.portfolio, cacheKey, stored);
    return stored || null;
  },

  setPortfolio(cacheKey, snapshot) {
    this.rememberInMemory(this.memory.portfolio, cacheKey, snapshot);
    const data = this.readStore(this.PORTFOLIO_KEY);
    data[cacheKey] = snapshot;
    this.writeStore(this.PORTFOLIO_KEY, data);
  },

  getBlockscoutChain(cacheKey) {
    if (this.memory.blockscout.has(cacheKey)) return this.memory.blockscout.get(cacheKey);
    const stored = this.readStore(this.BLOCKSCOUT_KEY)[cacheKey];
    if (stored) this.rememberInMemory(this.memory.blockscout, cacheKey, stored);
    return stored || null;
  },

  setBlockscoutChain(cacheKey, payload) {
    this.rememberInMemory(this.memory.blockscout, cacheKey, payload);
    const data = this.readStore(this.BLOCKSCOUT_KEY);
    data[cacheKey] = payload;
    this.writeStore(this.BLOCKSCOUT_KEY, data);
  },

  clear() {
    this.memory.portfolio.clear();
    this.memory.blockscout.clear();
    this.inflight.clear();
    try {
      localStorage.removeItem(this.PORTFOLIO_KEY);
      localStorage.removeItem(this.BLOCKSCOUT_KEY);
    } catch {}
  },
};

function loadWalletBalancesCached(address, market, options = {}) {
  return loadWalletBalancesOnchain(address, market, options);
}

const SPARK_RESERVE_CACHE_KEY = "bankirr_spark_reserves_v1";
const SPARK_RESERVE_TTL_MS = 12 * 60 * 60 * 1000;
const MARKET_CACHE_TTL_MS = 60 * 1000;
let marketDataCache = null;
// Last-known good native (ETH/POL/BNB) USD prices, so a rate-limited price fetch
// falls back to the previous value instead of dropping native balances to zero.
const lastNativePrices = {};

function getCachedSparkReserveTokens() {
  try {
    const raw = localStorage.getItem(SPARK_RESERVE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fetchedAt || !Array.isArray(parsed.tokens)) return null;
    if (Date.now() - parsed.fetchedAt > SPARK_RESERVE_TTL_MS) return null;
    return parsed.tokens;
  } catch {
    return null;
  }
}

function setCachedSparkReserveTokens(tokens) {
  try {
    localStorage.setItem(SPARK_RESERVE_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), tokens }));
  } catch {
    // Ignore storage failures, runtime cache still works.
  }
}

// Drop every compute-side cache (called by the dashboard on logout).
function clearComputeCaches() {
  PortfolioCache.clear();
  marketDataCache = null;
  state.uniswapPositionIdCache.clear();
  onchainPriceCache.clear();
  try { localStorage.removeItem(SPARK_RESERVE_CACHE_KEY); } catch {}
}

function marketCacheKey(tokenAddresses = []) {
  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))].filter(Boolean).sort();
  return unique.join(",");
}

function isLendingReceiptToken(symbol = "") {
  const s = String(symbol).trim();
  if (!s) return false;
  if (/^sp[A-Z]/i.test(s)) return true;
  if (/^a[A-Z]{2,}/.test(s)) return true;
  if (/debt/i.test(s)) return true;
  return false;
}

function isUniswapLpReceiptToken(symbol = "") {
  return /^UNI-V\d/i.test(String(symbol).trim());
}

/** Wallet scans include aTokens/LP receipts already counted in DeFi modules. */
function adjustNativeAssetsForDefi(nativeAssets, spark, aave, uniswap) {
  if (!nativeAssets?.balances?.length) return nativeAssets;
  const defiUsd =
    (spark?.assetsUsd || 0) + (aave?.assetsUsd || 0) + (uniswap?.assetsUsd || 0);
  if (defiUsd <= 0.01) return nativeAssets;
  const balances = nativeAssets.balances.filter((row) => {
    if (isLendingReceiptToken(row.symbol)) return false;
    if ((uniswap?.assetsUsd || 0) > 0.01 && isUniswapLpReceiptToken(row.symbol)) return false;
    return true;
  });
  return {
    ...nativeAssets,
    balances,
    assetsUsd: balances.reduce((sum, row) => sum + row.valueUsd, 0),
  };
}

function buildPortfolioRenderData(nativeAssets, spark, aave, uniswap) {
  const walletAssets = adjustNativeAssetsForDefi(nativeAssets, spark, aave, uniswap);
  const totalAssets =
    walletAssets.assetsUsd + spark.assetsUsd + aave.assetsUsd + uniswap.assetsUsd;
  const totalDebt = spark.debtUsd + aave.debtUsd;
  const netWorth = totalAssets - totalDebt;
  const netDaily = spark.daily + aave.daily + uniswap.daily;
  const blendedApr = netWorth > 0 ? (netDaily * 365 * 100) / netWorth : NaN;
  return {
    totalAssets,
    totalDebt,
    netWorth,
    netDaily,
    blendedApr,
    healthFactor: minHealthFactor(spark.healthFactor, aave.healthFactor),
    contributions: [
      { label: "Spark supply", value: spark.supplyDaily },
      { label: "Lido staking", value: spark.lidoDaily },
      { label: "Spark debt", value: -spark.borrowDaily },
      { label: "Aave supply", value: aave.supplyDaily },
      { label: "Aave debt", value: -aave.borrowDaily },
      { label: "Uniswap LP fees", value: uniswap.daily },
    ],
  };
}

function buildPortfolioSnapshot(address, ens, nativeAssets, spark, aave, uniswap, market) {
  return {
    address,
    ens,
    fetchedAt: Date.now(),
    nativeAssets,
    spark,
    aave,
    uniswap,
    market: { ethUsd: market.ethUsd || 0, polUsd: market.polUsd || 0 },
    renderData: buildPortfolioRenderData(nativeAssets, spark, aave, uniswap),
  };
}
async function getSparkReserveTokenList(options = {}) {
  const cached = !options.forceRefresh && getCachedSparkReserveTokens();
  if (cached?.length) return cached;
  const provider = await getProvider();
  const dataProviderAddress = CONFIG.spark.protocolDataProvider;
  const dataProvider = new ethers.Contract(dataProviderAddress, ABIS.protocolDataProvider, provider);
  const reserves = await dataProvider.getAllReservesTokens();
  const tokens = reserves.map((reserve) => reserve.tokenAddress);
  setCachedSparkReserveTokens(tokens);
  return tokens;
}

function emptySpark() {
  return {
    supplies: [],
    borrows: [],
    assetsUsd: 0,
    debtUsd: 0,
    netUsd: 0,
    daily: 0,
    supplyDaily: 0,
    lidoDaily: 0,
    borrowDaily: 0,
    healthFactor: NaN,
  };
}

function emptyNativeBalances() {
  return {
    balances: [],
    assetsUsd: 0,
    failedNetworks: [],
  };
}

function emptyAave() {
  return {
    supplies: [],
    borrows: [],
    assetsUsd: 0,
    debtUsd: 0,
    daily: 0,
    supplyDaily: 0,
    borrowDaily: 0,
    healthFactor: NaN,
    failedMarkets: [],
  };
}

function emptyUniswap() {
  return { positions: [], assetsUsd: 0, daily: 0 };
}

function minHealthFactor(...values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length > 0) return Math.min(...finite);
  return values.includes(Infinity) ? Infinity : NaN;
}

async function loadSingleWalletData(address, market, sparkReserveTokens, options = {}) {
  let resolved;
  const asAddress = byIdChecksum(address);
  if (asAddress) {
    resolved = { address: asAddress, ens: "" };
  } else {
    try { resolved = await resolveWallet(address); }
    catch { resolved = { address, ens: "" }; }
  }

  const [nativeResult, sparkResult, aaveResult, uniResult] = await Promise.allSettled([
    loadWalletBalancesCached(resolved.address, market, options),
    withTimeout(loadSpark(resolved.address, market), 25000, "Spark"),
    loadAave(resolved.address, market),
    loadLiquidityPools(resolved.address, market, options),
  ]);

  const nativeAssets = nativeResult.status === "fulfilled" ? nativeResult.value : emptyNativeBalances();
  const spark = sparkResult.status === "fulfilled" ? sparkResult.value : emptySpark();
  const aave = aaveResult.status === "fulfilled" ? aaveResult.value : emptyAave();
  const uniswap = uniResult.status === "fulfilled" ? uniResult.value : emptyUniswap();

  return {
    address: resolved.address,
    nativeAssets: adjustNativeAssetsForDefi(nativeAssets, spark, aave, uniswap),
    spark,
    aave,
    uniswap,
  };
}

// ─── MULTICHAIN WALLET BALANCES (Blockscout API) ─────────────────────────────
// Free, CORS-enabled, built-in scam filtering (reputation !== "scam"), USD prices.
const BLOCKSCOUT_BASES = {
  ethereum: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
  optimism: "https://optimism.blockscout.com",
  polygon: "https://polygon.blockscout.com",
  unichain: "https://unichain.blockscout.com",
  bnb: "https://bsc.blockscout.com",
};
const MIN_WALLET_TOKEN_USD = 0.01;
const BLOCKSCOUT_MAX_TOKEN_PAGES = 8;
const BLOCKSCOUT_FAST_TOKEN_PAGES = 3;
const BLOCKSCOUT_CHAIN_CONCURRENCY = 4;
const WRAPPED_NATIVE_SYMBOLS = new Set(["WETH", "WETH.E", "WMATIC", "WPOL"]);

function blockscoutTokenValueUsd(item) {
  const token = item.token || {};
  const decimals = Number(token.decimals || 18);
  const balance = Number(item.value || 0) / 10 ** decimals;
  const priceUsd = Number(token.exchange_rate || 0);
  return { balance, priceUsd, valueUsd: balance * priceUsd };
}

function parseBlockscoutToken(item, networkLabel, nativeSymbol = "") {
  const token = item.token || {};
  if (token.reputation === "scam" || token.type !== "ERC-20") return null;
  const { balance, priceUsd, valueUsd } = blockscoutTokenValueUsd(item);
  if (balance <= 0 || valueUsd < MIN_WALLET_TOKEN_USD) return null;
  const contractAddress = (token.address_hash || "").toLowerCase();
  const symbol = token.symbol || "?";
  return {
    network: networkLabel,
    symbol,
    balance,
    priceUsd,
    valueUsd,
    contractAddress,
    tier: tokenTier(symbol, contractAddress, { nativeSymbol }),
  };
}

async function fetchBlockscoutErc20Tokens(
  baseUrl,
  address,
  networkLabel,
  nativeSymbol = "",
  maxPages = BLOCKSCOUT_MAX_TOKEN_PAGES,
  retryCount = 2,
) {
  const tokens = [];
  let nextParams = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({ type: "ERC-20" });
    if (nextParams) {
      Object.entries(nextParams).forEach(([key, value]) => query.set(key, String(value)));
    }
    const data = await fetchJsonWithRetry(
      `${baseUrl}/api/v2/addresses/${address}/tokens?${query}`,
      { timeoutMs: 10000, cache: "no-cache" },
      retryCount,
    );
    const items = data.items || [];
    let pageBelowThreshold = items.length > 0;
    for (const item of items) {
      const parsed = parseBlockscoutToken(item, networkLabel, nativeSymbol);
      if (parsed) {
        tokens.push(parsed);
        pageBelowThreshold = false;
      } else {
        const { valueUsd } = blockscoutTokenValueUsd(item);
        if (valueUsd >= MIN_WALLET_TOKEN_USD) pageBelowThreshold = false;
      }
    }
    nextParams = data.next_page_params;
    if (!nextParams || pageBelowThreshold) break;
  }
  return tokens;
}

async function loadBlockscoutChainBalancesFresh(address, networkKey, networkConfig, market = {}, options = {}) {
  const baseUrl = BLOCKSCOUT_BASES[networkKey];
  if (!baseUrl) throw new Error(`No Blockscout instance for ${networkKey}`);
  const maxPages = options.forceRefresh || options.statusBar ? BLOCKSCOUT_MAX_TOKEN_PAGES : BLOCKSCOUT_FAST_TOKEN_PAGES;
  const retryCount = options.forceRefresh || options.statusBar ? 2 : 1;

  let addressInfo;
  let erc20Tokens;
  try {
    [addressInfo, erc20Tokens] = await Promise.all([
      fetchJsonWithRetry(`${baseUrl}/api/v2/addresses/${address}`, { timeoutMs: 8000, cache: "no-cache" }, retryCount),
      fetchBlockscoutErc20Tokens(baseUrl, address, networkConfig.label, networkConfig.nativeSymbol, maxPages, retryCount),
    ]);
  } catch (error) {
    const rpcNative = await loadNativeBalance(address, networkKey, networkConfig, market);
    if (rpcNative.balance > 0.000001 && rpcNative.valueUsd >= 0.01) {
      return { balances: [rpcNative], assetsUsd: rpcNative.valueUsd, partial: true };
    }
    throw error;
  }

  const balances = [...erc20Tokens];
  let nativeBalance = Number(addressInfo.coin_balance || 0) / 1e18;
  let nativePrice = Number(addressInfo.exchange_rate || 0) || nativePriceUsd(networkConfig.nativePriceKey, market);
  let nativeValueUsd = nativeBalance * nativePrice;

  if (nativeBalance <= 0.000001 || nativeValueUsd < 0.01) {
    try {
      const rpcNative = await loadNativeBalance(address, networkKey, networkConfig, market);
      if (rpcNative.balance > nativeBalance && rpcNative.valueUsd >= 0.01) {
        nativeBalance = rpcNative.balance;
        nativePrice = rpcNative.priceUsd;
        nativeValueUsd = rpcNative.valueUsd;
      }
    } catch {
      // Keep Blockscout values when RPC fallback is unavailable.
    }
  }

  if (nativeBalance > 0.000001 && nativeValueUsd >= 0.01) {
    balances.unshift({
      network: networkConfig.label,
      symbol: networkConfig.nativeSymbol,
      balance: nativeBalance,
      priceUsd: nativePrice,
      valueUsd: nativeValueUsd,
      tier: "blue_chip",
    });
  }

  const nativeKey = `${networkConfig.label}:${networkConfig.nativeSymbol.toUpperCase()}`;
  const hasNative = balances.some((row) => `${row.network}:${row.symbol.toUpperCase()}` === nativeKey);
  const filtered = balances.filter((row) => {
    if (!hasNative) return true;
    const sym = row.symbol.toUpperCase();
    return !(WRAPPED_NATIVE_SYMBOLS.has(sym) && row.network === networkConfig.label);
  });

  const tagged = tagBalanceTiers(filtered, networkConfig);
  return {
    balances: tagged,
    assetsUsd: tagged.reduce((sum, row) => sum + row.valueUsd, 0),
  };
}

async function loadBlockscoutChainBalances(address, networkKey, networkConfig, market = {}, options = {}) {
  const cacheKey = `${address.toLowerCase()}:${networkKey}`;
  const cached = !options.forceRefresh && PortfolioCache.getBlockscoutChain(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PortfolioCache.BLOCKSCOUT_TTL_MS) {
    return { balances: cached.balances, assetsUsd: cached.assetsUsd };
  }

  const result = await loadBlockscoutChainBalancesFresh(address, networkKey, networkConfig, market, options);
  const shouldCache = !result.partial && (!options.statusBar || result.assetsUsd > 0);
  if (shouldCache) {
    PortfolioCache.setBlockscoutChain(cacheKey, { ...result, fetchedAt: Date.now() });
  }
  return result;
}

const STATUS_BAR_CHAIN_PRIORITY = ["arbitrum", "base", "optimism", "polygon", "ethereum", "unichain"];

function orderedBlockscoutNetworks(statusBar = false) {
  const entries = Object.entries(CONFIG.networks).filter(([key]) => BLOCKSCOUT_BASES[key]);
  if (!statusBar) return entries;
  return entries
    .filter(([key]) => STATUS_BAR_CHAIN_PRIORITY.includes(key))
    .sort(
      (a, b) => (STATUS_BAR_CHAIN_PRIORITY.indexOf(a[0]) ?? 99) - (STATUS_BAR_CHAIN_PRIORITY.indexOf(b[0]) ?? 99),
    );
}

async function loadWalletBalancesViaBlockscout(address, market = {}, options = {}) {
  const inflightKey = `${address.toLowerCase()}:${options.forceRefresh ? "force" : "cached"}:${options.statusBar ? "status" : "web"}`;
  if (PortfolioCache.inflight.has(inflightKey)) return PortfolioCache.inflight.get(inflightKey);

  const promise = (async () => {
    const entries = orderedBlockscoutNetworks(options.statusBar);
    const chainConcurrency = options.statusBar ? 3 : BLOCKSCOUT_CHAIN_CONCURRENCY;
    const chainTimeoutMs = options.statusBar ? 15000 : 12000;
    const results = await settleWithConcurrency(
      entries,
      chainConcurrency,
      ([networkKey, networkConfig]) =>
        withTimeout(
          loadBlockscoutChainBalances(address, networkKey, networkConfig, market, options),
          chainTimeoutMs,
          `${networkConfig.label} wallet scan`,
        ),
    );

    const failedNetworks = results
      .map((result, index) => ({ result, network: entries[index][1] }))
      .filter(({ result }) => result.status === "rejected");

    const balances = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value.balances);

    balances.sort((a, b) => b.valueUsd - a.valueUsd);
    state.timestamps.native = new Date();

    return {
      balances,
      assetsUsd: balances.reduce((sum, row) => sum + row.valueUsd, 0),
      failedNetworks,
    };
  })();

  PortfolioCache.inflight.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    PortfolioCache.inflight.delete(inflightKey);
  }
}

// ─── ON-CHAIN WALLET BALANCES (Alchemy enumerator + on-chain verify) ─────────
// Preferred path: Alchemy's Data API tells us *which* ERC-20 contracts a wallet
// holds (multichain, one enumeration per wallet, reached via the server proxy so
// the key never ships to the browser). We then re-read balances on-chain via
// multicall and price tokens ourselves, so a token only counts if we can attach
// a trusted price — that is what keeps spam tokens (which aggregators happily
// price) out of the total. Blockscout stays as a per-chain fallback so a failed
// enumeration degrades to the old behaviour rather than to zero.

// CoinGecko asset-platform ids for the /simple/token_price/{platform} endpoint.
const COINGECKO_PLATFORMS = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  polygon: "polygon-pos",
  bnb: "binance-smart-chain",
  unichain: "unichain",
};

// Spam guard for the GeckoTerminal fallback: only trust an on-chain DEX price
// when there is real liquidity/volume behind the token, so fake-pool spam
// (e.g. a "$39,930 TRUE") is rejected. Bounded per chain to protect rate limits.
const GECKOTERMINAL_MIN_RESERVE_USD = 25000;
const GECKOTERMINAL_MIN_VOLUME_USD = 5000;
const GECKOTERMINAL_MAX_LOOKUPS = 12;

// Cap how many contracts we independently price/verify per chain. Tokens are
// ranked by Alchemy's rough USD hint first, so real holdings are always covered
// and only deep dust/spam tails (whales like vitalik.eth hold 1000+ per chain)
// are skipped — keeps pathological wallets fast without dropping value.
const WALLET_TOKEN_PRICE_CAP = 250;

// When a chain holds at most this many tokens we price them all (cheap, and
// never misses a real token Alchemy failed to price). Above it we fall back to
// the hint-ranked prefilter to keep whale/spam-flooded wallets fast.
const WALLET_TOKEN_FULL_PRICE_LIMIT = 80;

// Blue-chip symbols always survive flooded-chain caps (ETH, BNB, stables, etc.).
const BLUE_CHIP_SYMBOLS = new Set([
  "ETH", "WETH", "BNB", "WBNB", "POL", "MATIC", "WMATIC", "WPOL",
  "WBTC", "BTC", "USDC", "USDT", "DAI", "USDE", "FRAX", "LUSD",
  "STETH", "WSTETH", "CBETH", "RETH", "LINK", "AAVE", "UNI",
]);

function isBlueChipContract(address) {
  const key = String(address || "").toLowerCase();
  return CONFIG.knownStablecoins.has(key) || CONFIG.knownEthLike.has(key);
}

function isBlueChipSymbol(symbol, nativeSymbol) {
  const sym = String(symbol || "").toUpperCase();
  if (!sym) return false;
  if (BLUE_CHIP_SYMBOLS.has(sym)) return true;
  if (nativeSymbol && sym === String(nativeSymbol).toUpperCase()) return true;
  return false;
}

function tokenTier(symbol, contractAddress, networkConfig) {
  if (isBlueChipContract(contractAddress)) return "blue_chip";
  if (isBlueChipSymbol(symbol, networkConfig?.nativeSymbol)) return "blue_chip";
  return "other";
}

function tagBalanceTiers(rows, networkConfig) {
  return rows.map((row) => ({
    ...row,
    tier: row.tier || tokenTier(row.symbol, row.contractAddress, networkConfig),
  }));
}

// On flooded chains, always price blue-chip contracts first, then fill remaining
// slots by Alchemy hint rank (no minimum hint — avoids dropping real tokens).
function selectTokensForPricing(allTokens) {
  if (!allTokens.length) return [];
  if (allTokens.length <= WALLET_TOKEN_FULL_PRICE_LIMIT) return allTokens;

  const blue = [];
  const rest = [];
  for (const t of allTokens) {
    const addr = String(t.tokenAddress || "").toLowerCase();
    if (isBlueChipContract(addr)) blue.push(t);
    else rest.push(t);
  }

  const seen = new Set(blue.map((t) => String(t.tokenAddress).toLowerCase()));
  const slots = Math.max(0, WALLET_TOKEN_PRICE_CAP - blue.length);
  const rankedRest = rest
    .sort((a, b) => (b.hintUsd || 0) - (a.hintUsd || 0))
    .filter((t) => {
      const key = String(t.tokenAddress).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, slots);

  return [...blue, ...rankedRest];
}

// Last-known CoinGecko token prices, so a rate-limited call reuses prior prices
// instead of dropping tokens to zero (the "sometimes slips to 0" failure mode).
const coingeckoPriceCache = new Map();
const COINGECKO_PRICE_TTL_MS = 5 * 60 * 1000;

// Last-known good balances per (wallet, chain) so a transient failure on one
// chain reuses its previous value instead of contributing zero.
const walletChainCache = new Map();
const WALLET_CHAIN_TTL_MS = 5 * 60 * 1000;

async function fetchCoingeckoTokenPrices(networkKey, addresses) {
  const platform = COINGECKO_PLATFORMS[networkKey];
  const prices = {};
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!platform || !unique.length) return prices;

  // Serve fresh cached prices; only fetch the misses.
  const toFetch = [];
  for (const address of unique) {
    const cached = coingeckoPriceCache.get(`${networkKey}:${address}`);
    if (cached && Date.now() - cached.fetchedAt < COINGECKO_PRICE_TTL_MS && cached.price > 0) {
      prices[address] = cached.price;
    } else {
      toFetch.push(address);
    }
  }

  for (let i = 0; i < toFetch.length; i += 100) {
    const chunk = toFetch.slice(i, i + 100);
    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?vs_currencies=usd&contract_addresses=${chunk.join(",")}`;
      const result = await fetchJson(url, { timeoutMs: 5000 });
      Object.entries(result).forEach(([addr, data]) => {
        const price = Number(data?.usd || 0);
        if (price > 0) {
          const key = addr.toLowerCase();
          prices[key] = price;
          coingeckoPriceCache.set(`${networkKey}:${key}`, { price, fetchedAt: Date.now() });
        }
      });
    } catch {
      // Rate-limited/failed: fall back to any stale cached price so we don't
      // drop a real token to zero.
      for (const address of chunk) {
        const cached = coingeckoPriceCache.get(`${networkKey}:${address}`);
        if (cached && cached.price > 0 && !(prices[address] > 0)) prices[address] = cached.price;
      }
    }
  }
  return prices;
}

async function fetchGuardedOnchainPrice(geckoNetwork, address, market) {
  if (!geckoNetwork) return 0;
  const cacheKey = `${geckoNetwork}:${address}`;
  const cached = onchainPriceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ONCHAIN_PRICE_TTL_MS && cached.price > 0) {
    return cached.price;
  }
  try {
    const result = await fetchJson(`${CONFIG.geckoTokenBaseUrl}/${geckoNetwork}/tokens/${address}`, { timeoutMs: 2500 });
    const attr = result.data?.attributes || {};
    const price = Number(attr.price_usd || 0);
    const reserve = Number(attr.total_reserve_in_usd || 0);
    const volume = Number(attr.volume_usd?.h24 || 0);
    if (price > 0 && (reserve >= GECKOTERMINAL_MIN_RESERVE_USD || volume >= GECKOTERMINAL_MIN_VOLUME_USD)) {
      onchainPriceCache.set(cacheKey, { price, fetchedAt: Date.now() });
      return price;
    }
  } catch {
    // No trusted on-chain price → token is dropped.
  }
  return 0;
}

// Resolve USD prices for a chain's enumerated ERC-20s. CoinGecko's curated list
// is the primary (spam-resistant) source; stables/ETH-like get a fast fallback;
// a bounded GeckoTerminal pass covers real-but-unlisted tokens.
async function priceWalletTokens(networkKey, contracts, market) {
  const prices = {};
  const unique = [...new Set(contracts.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!unique.length) return prices;

  for (const address of unique) {
    const fb = fallbackTokenPrice(address, "", market.ethUsd || state.ethUsd, market.wstEthUsd || 0);
    if (fb > 0) prices[address] = fb;
  }

  Object.assign(prices, await fetchCoingeckoTokenPrices(networkKey, unique));

  const misses = unique.filter((a) => !(prices[a] > 0)).slice(0, GECKOTERMINAL_MAX_LOOKUPS);
  if (misses.length) {
    const geckoNetwork = CONFIG.networks[networkKey]?.geckoNetwork;
    await settleWithConcurrency(misses, 4, async (address) => {
      const price = await fetchGuardedOnchainPrice(geckoNetwork, address, market);
      if (price > 0) prices[address] = price;
    });
  }
  return prices;
}

// On-chain verification: read balanceOf + decimals + symbol for the priced
// survivors via multicall so the amount is authoritative (never the enumerator's).
async function verifyTokenBalances(addresses, owner, provider) {
  const iface = new ethers.Interface(ABIS.erc20);
  const out = [];
  for (let i = 0; i < addresses.length; i += 120) {
    const chunk = addresses.slice(i, i + 120);
    const calls = chunk.flatMap((token) => [
      { target: token, allowFailure: true, callData: iface.encodeFunctionData("balanceOf", [owner]) },
      { target: token, allowFailure: true, callData: iface.encodeFunctionData("decimals", []) },
      { target: token, allowFailure: true, callData: iface.encodeFunctionData("symbol", []) },
    ]);
    let results;
    try {
      results = await multicall(calls, provider);
    } catch {
      continue;
    }
    for (let j = 0; j < chunk.length; j += 1) {
      const balResult = results[j * 3];
      const decResult = results[j * 3 + 1];
      const symResult = results[j * 3 + 2];
      if (!balResult?.success || balResult.returnData === "0x") continue;
      let rawBalance;
      try {
        rawBalance = iface.decodeFunctionResult("balanceOf", balResult.returnData)[0];
      } catch {
        continue;
      }
      if (rawBalance === 0n) continue;
      const decimals =
        decResult?.success && decResult.returnData !== "0x"
          ? Number(iface.decodeFunctionResult("decimals", decResult.returnData)[0])
          : 18;
      let symbol = "TOKEN";
      try {
        if (symResult?.success && symResult.returnData !== "0x") {
          symbol = iface.decodeFunctionResult("symbol", symResult.returnData)[0];
        }
      } catch {
        // Non-standard (bytes32) symbol — keep the placeholder.
      }
      out.push({ address: chunk[j], balance: Number(ethers.formatUnits(rawBalance, decimals)), symbol });
    }
  }
  return out;
}

function dedupeWrappedNative(rows, networkConfig) {
  const nativeKey = `${networkConfig.label}:${networkConfig.nativeSymbol.toUpperCase()}`;
  const hasNative = rows.some((row) => `${row.network}:${row.symbol.toUpperCase()}` === nativeKey);
  if (!hasNative) return rows;
  return rows.filter(
    (row) => !(WRAPPED_NATIVE_SYMBOLS.has(row.symbol.toUpperCase()) && row.network === networkConfig.label),
  );
}

async function loadOnchainChainBalances(address, networkKey, netData, market) {
  const networkConfig = CONFIG.networks[networkKey];
  const provider = await getNetworkProvider(networkKey);
  const rows = [];

  // Native balance: prefer the node balance from enumeration, verify via RPC.
  let nativeBalance = 0;
  if (netData.nativeRaw) {
    try {
      nativeBalance = Number(ethers.formatEther(BigInt(netData.nativeRaw)));
    } catch {
      nativeBalance = 0;
    }
  }
  if (nativeBalance <= 0) {
    try {
      nativeBalance = Number(ethers.formatEther(await provider.getBalance(address)));
    } catch {
      nativeBalance = 0;
    }
  }
  const nativePrice = nativePriceUsd(networkConfig.nativePriceKey, market);
  const nativeValue = nativeBalance * nativePrice;
  if (nativeBalance > 0.000001 && nativeValue >= MIN_WALLET_TOKEN_USD) {
    rows.push({
      network: networkConfig.label,
      symbol: networkConfig.nativeSymbol,
      balance: nativeBalance,
      priceUsd: nativePrice,
      valueUsd: nativeValue,
      tier: "blue_chip",
    });
  }

  // ERC-20s: load all tokens on normal wallets; on flooded chains always price
  // blue-chip contracts first, then rank the rest by Alchemy hint (no hint floor).
  const allTokens = netData.tokens || [];
  const ranked = selectTokensForPricing(allTokens);
  const contracts = ranked.map((t) => t.tokenAddress);
  const prices = await priceWalletTokens(networkKey, contracts, market);
  const priced = [...new Set(contracts.map((a) => a.toLowerCase()))].filter((a) => prices[a] > 0);
  if (priced.length) {
    const verified = await verifyTokenBalances(priced, address, provider);
    for (const token of verified) {
      const price = prices[token.address];
      const valueUsd = token.balance * price;
      if (token.balance > 0 && valueUsd >= MIN_WALLET_TOKEN_USD) {
        rows.push({
          network: networkConfig.label,
          symbol: token.symbol || "?",
          balance: token.balance,
          priceUsd: price,
          valueUsd,
          contractAddress: token.address,
          tier: tokenTier(token.symbol, token.address, networkConfig),
        });
      }
    }
  }

  const filtered = tagBalanceTiers(dedupeWrappedNative(rows, networkConfig), networkConfig);
  return { balances: filtered, assetsUsd: filtered.reduce((sum, row) => sum + row.valueUsd, 0) };
}

// One chain failed (enumeration missing, timeout, or scan threw): reuse the
// last-known balances, else fall back to Blockscout — never contribute zero.
async function chainFallback(address, networkKey, market, options, cacheKey) {
  const cached = walletChainCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < WALLET_CHAIN_TTL_MS) {
    return { balances: cached.balances, assetsUsd: cached.balances.reduce((sum, row) => sum + row.valueUsd, 0) };
  }
  const networkConfig = CONFIG.networks[networkKey];
  if (BLOCKSCOUT_BASES[networkKey]) {
    try {
      const bs = await loadBlockscoutChainBalances(address, networkKey, networkConfig, market, options);
      if (bs.balances?.length) {
        walletChainCache.set(cacheKey, { balances: bs.balances, fetchedAt: Date.now() });
      }
      return { balances: bs.balances || [], assetsUsd: bs.assetsUsd || 0 };
    } catch {
      // fall through to empty
    }
  }
  return { balances: [], assetsUsd: 0 };
}

async function loadWalletBalancesOnchain(address, market = {}, options = {}) {
  const networkKeys = Object.keys(CONFIG.networks).filter(
    (key) => COINGECKO_PLATFORMS[key] || BLOCKSCOUT_BASES[key],
  );

  let enumeration = null;
  try {
    const data = await fetchJson(`${CONFIG.tokenBalancesUrl}?address=${address}`, {
      timeoutMs: 20000,
      cache: "no-cache",
    });
    if (data && data.byNetwork) enumeration = data;
  } catch {
    enumeration = null;
  }

  // Whole enumeration unavailable (no key / proxy down) → legacy Blockscout scan.
  if (!enumeration) {
    return loadWalletBalancesViaBlockscout(address, market, options);
  }

  const failed = new Set(enumeration.failed || []);
  const results = await settleWithConcurrency(networkKeys, 4, async (networkKey) => {
    const cacheKey = `${address.toLowerCase()}:${networkKey}`;
    const netData = enumeration.byNetwork[networkKey];
    if (!netData || failed.has(networkKey)) {
      return chainFallback(address, networkKey, market, options, cacheKey);
    }
    try {
      const chain = await withTimeout(
        loadOnchainChainBalances(address, networkKey, netData, market),
        15000,
        `${networkKey} on-chain scan`,
      );
      walletChainCache.set(cacheKey, { balances: chain.balances, fetchedAt: Date.now() });
      return chain;
    } catch {
      return chainFallback(address, networkKey, market, options, cacheKey);
    }
  });

  const balances = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value.balances);
  balances.sort((a, b) => b.valueUsd - a.valueUsd);
  state.timestamps.native = new Date();

  return {
    balances,
    assetsUsd: balances.reduce((sum, row) => sum + row.valueUsd, 0),
    failedNetworks: [],
  };
}

function portfolioNetWorth(snapshot) {
  if (!snapshot) return 0;
  return Number(snapshot.renderData?.netWorth ?? 0);
}

function publishStatusBarResult(output, inputKey, snapshot, extra = {}) {
  output.results[inputKey] = { ok: true, snapshot, ...extra };
  const resolvedKey = String(snapshot?.address || inputKey).toLowerCase();
  if (resolvedKey && resolvedKey !== inputKey.toLowerCase()) {
    output.results[resolvedKey] = { ok: true, snapshot, ...extra };
  }
}

async function loadPortfolioBatchForStatusBar(addresses, options = {}) {
  const list = [...new Set((addresses || []).map((a) => String(a).trim()).filter(Boolean))];
  const output = { results: {} };
  if (!list.length) return JSON.stringify(output);

  const forceRefresh = !!options.forceRefresh;
  const statusBarOptions = { ...options, statusBar: true };

  await getProvider();
  const sparkReserveTokens = await getSparkReserveTokenList(statusBarOptions).catch(() => []);
  const market = await loadMarketData(sparkReserveTokens, statusBarOptions);

  await settleWithConcurrency(list, 2, async (addr) => {
    const inputKey = addr.trim();

    let resolvedAddress = inputKey;
    try {
      const resolved = await resolveWallet(inputKey);
      resolvedAddress = resolved.address;
    } catch (_) {
      // loadSingleWalletData will try again
    }

    const cacheKey = resolvedAddress.toLowerCase();
    const previous = PortfolioCache.getPortfolio(cacheKey);
    if (!forceRefresh) {
      const cached = previous;
      if (cached && Date.now() - cached.fetchedAt < PortfolioCache.SKIP_FETCH_MS) {
        // Do not reuse empty snapshots — they are often caused by transient L2/API failures.
        if (portfolioNetWorth(cached) > 0) {
          publishStatusBarResult(output, inputKey, cached, { cached: true });
          return cached;
        }
      }
    }

    try {
      const data = await loadSingleWalletData(inputKey, market, sparkReserveTokens, statusBarOptions);
      const finalAddress = data.address || resolvedAddress;
      const finalKey = finalAddress.toLowerCase();
      const snapshot = buildPortfolioSnapshot(
        finalAddress,
        "",
        data.nativeAssets,
        data.spark,
        data.aave,
        data.uniswap,
        market
      );
      const newNet = portfolioNetWorth(snapshot);
      const prevNet = portfolioNetWorth(previous);

      if (previous && prevNet > 0 && newNet <= 0) {
        publishStatusBarResult(output, inputKey, previous, { stale: true });
        return previous;
      }

      if (newNet > 0) {
        PortfolioCache.setPortfolio(finalKey, snapshot);
      }
      publishStatusBarResult(output, inputKey, snapshot);
      return snapshot;
    } catch (error) {
      if (previous) {
        publishStatusBarResult(output, inputKey, previous, { stale: true });
        return previous;
      }
      output.results[inputKey] = { ok: false, error: error?.message || String(error) };
      return null;
    }
  });

  return JSON.stringify(output);
}

return {
  CONFIG,
  PortfolioCache,
  clearComputeCaches,
  buildPortfolioRenderData,
  buildPortfolioSnapshot,
  emptyAave,
  emptyNativeBalances,
  emptySpark,
  emptyUniswap,
  fmtNumber,
  fmtPct,
  fmtUsd,
  formatPositionRef,
  getProvider,
  getSparkReserveTokenList,
  loadAave,
  loadLiquidityPools,
  loadMarketData,
  loadPortfolioBatchForStatusBar,
  loadSingleWalletData,
  loadSpark,
  loadWalletBalancesCached,
  normalizePairName,
  portfolioNetWorth,
  resolveWallet,
  settleWithConcurrency,
  shortAddress,
  state,
  withTimeout,
};
});
