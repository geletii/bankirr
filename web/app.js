const { ethers } = window;

// DOM-free portfolio computation lives in shared/portfolioCore.js (also used
// by the API server). This pulls the pieces the UI layer needs.
const {
  PortfolioCache,
  buildPortfolioRenderData,
  buildPortfolioSnapshot,
  clearComputeCaches,
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
  loadSingleWalletData,
  loadSpark,
  loadWalletBalancesCached,
  normalizePairName,
  resolveWallet,
  settleWithConcurrency,
  shortAddress,
  state,
  withTimeout,
} = window.BankirrCore;


const els = {
  introScreen: document.querySelector("#introScreen"),
  dashboardShell: document.querySelector("#dashboardShell"),
  networkSphere: document.querySelector("#networkSphere"),
  introConnectWallet: document.querySelector("#introConnectWallet"),
  introAddressToggle: document.querySelector("#introAddressToggle"),
  introAddressForm: document.querySelector("#introAddressForm"),
  introWalletInput: document.querySelector("#introWalletInput"),
  introLoadWallet: document.querySelector("#introLoadWallet"),
  introStatus: document.querySelector("#introStatus"),
  topCurrentBalance: document.querySelector("#heroNetWorth"),
  topCurrentBalanceEth: document.querySelector("#heroNetWorthEth"),
  topDailyIncomeUsd: document.querySelector("#heroDailyIncome"),
  topDailyIncomeEth: document.querySelector("#heroDailyIncomeEth"),
  topDailyIncomePct: document.querySelector("#heroDailyIncomePct"),
  topYearlyIncomeUsd: document.querySelector("#heroYearlyIncome"),
  topYearlyIncomeEth: document.querySelector("#heroYearlyIncomeEth"),
  topYearlyIncomePct: document.querySelector("#heroYearlyIncomePct"),
  heroNetWorth: document.querySelector("#heroNetWorth"),
  heroNetWorthEth: document.querySelector("#heroNetWorthEth"),
  heroSparkline: document.querySelector("#heroSparkline"),
  heroDailyIncome: document.querySelector("#heroDailyIncome"),
  heroDailyIncomeEth: document.querySelector("#heroDailyIncomeEth"),
  heroDailyIncomePct: document.querySelector("#heroDailyIncomePct"),
  heroYearlyIncome: document.querySelector("#heroYearlyIncome"),
  heroYearlyIncomeEth: document.querySelector("#heroYearlyIncomeEth"),
  heroYearlyIncomePct: document.querySelector("#heroYearlyIncomePct"),
  allocationCanvas: document.querySelector("#allocationCanvas"),
  allocationLegend: document.querySelector("#allocationLegend"),
  allocationModule: document.querySelector("#allocationModule"),
  netWorthHistoryCanvas: document.querySelector("#netWorthHistoryCanvas"),
  netWorthHistoryModule: document.querySelector("#netWorthHistoryModule"),
  hideDustToggle: document.querySelector("#hideDustToggle"),
  connectedWalletLabel: document.querySelector("#connectedWalletLabel"),
  walletInput: document.querySelector("#walletInput"),
  loadWallet: document.querySelector("#loadWallet"),
  connectWallet: document.querySelector("#connectWallet"),
  refreshData: document.querySelector("#refreshData"),
  statusLine: document.querySelector("#statusLine"),
  walletBar: document.querySelector("#walletBar"),
  loadProgressHostGlobal: document.querySelector("#loadProgressHostGlobal"),
  loadProgressHostWallet: document.querySelector("#loadProgressHostWallet"),
  loadProgress: document.querySelector("#loadProgress"),
  loadProgressBar: document.querySelector("#loadProgressBar"),
  walletLabel: document.querySelector("#walletLabel"),
  ensLabel: document.querySelector("#ensLabel"),
  portfolioValue: null,
  updatedAt: document.querySelector("#updatedAt"),
  netWorth: document.querySelector("#heroNetWorth"),
  netWorthEth: document.querySelector("#heroNetWorthEth"),
  dailyPnl: document.querySelector("#dailyPnl"),
  dailyPnlNote: document.querySelector("#dailyPnlNote"),
  blendedApr: document.querySelector("#blendedApr"),
  healthFactor: document.querySelector("#healthFactor"),
  summaryTotal: document.querySelector("#summaryTotal"),
  pnlBars: document.querySelector("#pnlBars"),
  walletAssetsSection: document.querySelector("#walletAssetsSection"),
  walletAssetsNet: document.querySelector("#walletAssetsNet"),
  walletAssetRows: document.querySelector("#walletAssetRows"),
  sparkSection: document.querySelector("#sparkSection"),
  sparkSupplyBlock: document.querySelector("#sparkSupplyBlock"),
  sparkBorrowBlock: document.querySelector("#sparkBorrowBlock"),
  sparkNet: document.querySelector("#sparkNet"),
  sparkSupplyMeta: document.querySelector("#sparkSupplyMeta"),
  sparkBorrowMeta: document.querySelector("#sparkBorrowMeta"),
  sparkSupplyRows: document.querySelector("#sparkSupplyRows"),
  sparkBorrowRows: document.querySelector("#sparkBorrowRows"),
  aaveSection: document.querySelector("#aaveSection"),
  aaveSupplyBlock: document.querySelector("#aaveSupplyBlock"),
  aaveBorrowBlock: document.querySelector("#aaveBorrowBlock"),
  aaveNet: document.querySelector("#aaveNet"),
  aaveSupplyMeta: document.querySelector("#aaveSupplyMeta"),
  aaveBorrowMeta: document.querySelector("#aaveBorrowMeta"),
  aaveSupplyRows: document.querySelector("#aaveSupplyRows"),
  aaveBorrowRows: document.querySelector("#aaveBorrowRows"),
  uniswapSection: document.querySelector("#uniswapSection"),
  uniswapAssets: document.querySelector("#uniswapAssets"),
  uniswapNet: document.querySelector("#uniswapNet"),
  uniswapPositions: document.querySelector("#uniswapPositions"),
  defiEmptyState: document.querySelector("#defiEmptyState"),
  sourceTimestamps: document.querySelector("#sourceTimestamps"),
};


let portfolioLoadGen = 0;
let lastNativeAssets = null;
let lastSnapshot = null;

const DUST_THRESHOLD_USD = 1;
const HOLDINGS_FILTERS = [
  { id: "all", label: "All" },
  { id: "blue_chip", label: "Blue chip" },
  { id: "other", label: "Other" },
];
const BLUE_CHIP_UI_SYMBOLS = new Set([
  "ETH", "WETH", "BNB", "WBNB", "POL", "MATIC", "WMATIC", "WPOL",
  "WBTC", "BTC", "USDC", "USDT", "DAI", "USDE", "FRAX", "LUSD",
  "STETH", "WSTETH", "CBETH", "RETH", "LINK", "AAVE", "UNI",
]);
let holdingsFilter = "all";
const ALLOCATION_COLORS = {
  Wallet: "#1de9c6",
  Spark: "#ff8c42",
  Aave: "#b6509e",
  Uniswap: "#ff007a",
  Debt: "#f0556a",
};
const CHAIN_META = {
  ethereum: { slug: "ethereum", label: "ETH" },
  mainnet: { slug: "ethereum", label: "ETH" },
  base: { slug: "base", label: "Base" },
  polygon: { slug: "polygon", label: "POL" },
  arbitrum: { slug: "arbitrum", label: "ARB" },
  optimism: { slug: "optimism", label: "OP" },
};
const NW_HISTORY_MAX = 72;

function bumpPortfolioLoadGen() {
  portfolioLoadGen += 1;
}
window.bumpPortfolioLoadGen = bumpPortfolioLoadGen;

function isPortfolioLoadStale(loadGen) {
  return loadGen !== portfolioLoadGen;
}

function isPortfolioDashboardStatus(message) {
  if (typeof message !== "string") return false;
  return message.includes("Portfolio updated")
    || message.includes("Portfolio loaded")
    || message.includes("updated ·")
    || message.includes("Updating portfolio")
    || message.startsWith("Loading portfolio")
    || message.startsWith("Updated ·");
}

if (window.location.protocol === "file:") {
  setStatus("Read-only mode is available. Wallet connect requires a browser where MetaMask injects a provider; localhost is more reliable than file://.", "warning");
}

function setBusy(isBusy) {
  [els.loadWallet, els.refreshData, els.connectWallet, els.introConnectWallet, els.introLoadWallet].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
}

function isPortfolioStatusMessage(message) {
  if (typeof message !== "string") return false;
  return isPortfolioDashboardStatus(message)
    || /Updating \d+ wallets/.test(message)
    || /Loading \d+ wallets/.test(message)
    || message.includes("wallet errors");
}

function shouldSuppressPortfolioStatus(message) {
  if (!isPortfolioStatusMessage(message)) return false;
  const dashboardHidden = els.dashboardShell?.classList.contains("is-hidden");
  const loggedIn = window.BankirrAuth?.isLoggedIn?.() ?? false;
  const walletCount = window.BankirrWallets?.list?.length || 0;
  return dashboardHidden || (!loggedIn && walletCount === 0);
}

function setStatus(message, tone = "") {
  if (shouldSuppressPortfolioStatus(message)) return;
  els.statusLine.textContent = message;
  els.statusLine.className = `status-line ${tone}`;
  if (els.introStatus && !isPortfolioDashboardStatus(message)) {
    els.introStatus.textContent = message;
    els.introStatus.className = `intro-status ${tone}`;
  }
}

function walletBarIsVisible() {
  if (!els.walletBar) return false;
  return !els.walletBar.hidden;
}

function placeLoadProgress() {
  if (!els.loadProgress) return;
  const targetHost =
    walletBarIsVisible() && els.loadProgressHostWallet ? els.loadProgressHostWallet : els.loadProgressHostGlobal;
  if (targetHost && els.loadProgress.parentElement !== targetHost) {
    targetHost.appendChild(els.loadProgress);
  }
  const isGlobal = targetHost === els.loadProgressHostGlobal;
  els.loadProgress.classList.toggle("load-progress-global", isGlobal);
}

function setLoadProgress(done, total, tone = "") {
  if (els.dashboardShell?.classList.contains("is-hidden")) return;
  if (!els.loadProgress || !els.loadProgressBar || !Number.isFinite(total) || total <= 0) return;
  placeLoadProgress();
  const pct = Math.max(0, Math.min((done / total) * 100, 100));
  els.loadProgress.hidden = false;
  els.loadProgress.className = `load-progress${els.loadProgress.classList.contains("load-progress-global") ? " load-progress-global" : ""} ${tone}`.trim();
  els.loadProgressBar.style.width = `${pct}%`;
}

function setLoadProgressIndeterminate(active, tone = "") {
  if (els.dashboardShell?.classList.contains("is-hidden")) return;
  if (!els.loadProgress || !els.loadProgressBar) return;
  if (!active) {
    clearLoadProgress();
    return;
  }
  placeLoadProgress();
  els.loadProgress.hidden = false;
  els.loadProgress.className = `load-progress${els.loadProgress.classList.contains("load-progress-global") ? " load-progress-global" : ""} indeterminate ${tone}`.trim();
  els.loadProgressBar.style.width = "35%";
}

function clearLoadProgress() {
  if (!els.loadProgress || !els.loadProgressBar) return;
  els.loadProgress.hidden = true;
  els.loadProgress.className = "load-progress";
  els.loadProgressBar.style.width = "0%";
}

function revealAddressEntry() {
  els.introAddressForm.hidden = false;
  els.introWalletInput.focus();
}

function revealDashboard() {
  els.dashboardShell.classList.remove("is-hidden");
  els.introScreen.classList.add("is-hidden");
  document.body.classList.remove("intro-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (typeof window.updateAuthUI === "function") window.updateAuthUI();
}

// Token symbols, pair names and contract metadata come from third-party APIs
// and on-chain contracts — escape them before any innerHTML interpolation.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function renderPairIcons(position) {
  const pair = normalizePairName(position.pair || "");
  const [left = "?", right = "?"] = pair.split("/");
  return `<div class="pair-icons" aria-hidden="true">
    <span class="token-badge" title="${escapeHtml(left)}">${escapeHtml(left.charAt(0))}</span>
    <span class="token-badge" title="${escapeHtml(right)}">${escapeHtml(right.charAt(0))}</span>
  </div>`;
}

function clientHidesWalletNumbers() {
  return window._clientProfile?.show_wallet_numbers === 0;
}

function clientShowsHealthFactor() {
  if (!window._clientProfile) return true;
  return window._clientProfile.show_risk !== 0;
}

function getBrowserWalletProvider() {
  if (state.injectedProvider) return state.injectedProvider;
  const providers = [];
  if (window.ethereum) providers.push(window.ethereum);
  if (window.ethereum?.providers?.length) providers.push(...window.ethereum.providers);
  const provider =
    providers.find((candidate) => candidate?.isMetaMask) ||
    providers.find((candidate) => typeof candidate?.request === "function") ||
    null;
  state.injectedProvider = provider;
  return provider;
}

window.addEventListener("eip6963:announceProvider", (event) => {
  const provider = event.detail?.provider;
  if (!state.injectedProvider && provider?.request) state.injectedProvider = provider;
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

// ─── PORTFOLIO & BLOCKSCOUT CACHE ─────────────────────────────────────────────
function formatCacheAge(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 15) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function hideDustEnabled() {
  if (!els.hideDustToggle) return false;
  return els.hideDustToggle.checked;
}

function inferHoldingsTier(row) {
  if (row.tier === "blue_chip" || row.tier === "other") return row.tier;
  const sym = String(row.symbol || "").toUpperCase();
  return BLUE_CHIP_UI_SYMBOLS.has(sym) ? "blue_chip" : "other";
}

function filterHoldingsBalances(balances) {
  let rows = balances || [];
  if (holdingsFilter !== "all") {
    rows = rows.filter((row) => inferHoldingsTier(row) === holdingsFilter);
  }
  if (hideDustEnabled()) {
    rows = rows.filter((row) => row.valueUsd >= DUST_THRESHOLD_USD);
  }
  return rows;
}

function ensureHoldingsFilterUI() {
  if (!els.walletAssetsSection || document.querySelector("#holdingsFilterBar")) return;
  const header = els.walletAssetsSection.querySelector(".section-header, .module-header, h2, h3");
  const bar = document.createElement("div");
  bar.id = "holdingsFilterBar";
  bar.className = "holdings-filter-bar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Holdings filter");
  HOLDINGS_FILTERS.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `holdings-filter-btn${holdingsFilter === filter.id ? " is-active" : ""}`;
    button.dataset.filter = filter.id;
    button.textContent = filter.label;
    button.addEventListener("click", () => {
      holdingsFilter = filter.id;
      bar.querySelectorAll(".holdings-filter-btn").forEach((node) => {
        node.classList.toggle("is-active", node.dataset.filter === holdingsFilter);
      });
      if (lastNativeAssets) renderWalletAssets(lastNativeAssets);
    });
    bar.appendChild(button);
  });
  if (header?.parentElement) {
    header.parentElement.insertBefore(bar, header.nextSibling);
  } else {
    els.walletAssetsSection.prepend(bar);
  }
}

function setSignedUsd(el, value) {
  if (!el) return;
  animateValue(el, value, (v) => signedUsd(v), 550);
  el.className = value >= 0 ? "positive" : "negative";
}

function animateValue(el, endValue, formatter, duration = 600) {
  if (!el) return;
  el.classList.remove("skeleton-text", "skeleton-text--hero");
  if (!Number.isFinite(endValue)) {
    el.textContent = formatter(endValue);
    el.dataset.value = "";
    return;
  }
  const startValue = Number(el.dataset.value);
  const from = Number.isFinite(startValue) ? startValue : endValue;
  if (Math.abs(from - endValue) < 0.005) {
    el.textContent = formatter(endValue);
    el.dataset.value = String(endValue);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = from + (endValue - from) * eased;
    el.textContent = formatter(current);
    if (t < 1) requestAnimationFrame(tick);
    else el.dataset.value = String(endValue);
  };
  requestAnimationFrame(tick);
}

function setHeroLoading() {
  if (!els.heroNetWorth) return;
  els.heroNetWorth.textContent = "████████";
  els.heroNetWorth.classList.add("skeleton-text", "skeleton-text--hero");
  if (els.heroNetWorthEth) els.heroNetWorthEth.textContent = "Wallet + lending + LP positions";
  [els.heroDailyIncome, els.heroYearlyIncome].forEach((el) => {
    if (!el) return;
    el.textContent = "████";
    el.classList.add("skeleton-text");
  });
}

function chainBadge(network) {
  const key = String(network || "").toLowerCase();
  const meta = CHAIN_META[key] || { slug: "generic", label: String(network || "?").slice(0, 4).toUpperCase() };
  return `<span class="chain-badge chain-badge--${meta.slug}" title="${escapeHtml(network)}">${escapeHtml(meta.label)}</span>`;
}

function emptyStateHtml({ title, desc = "" }) {
  return `<div class="ds-empty">
    <div class="ds-empty-icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 15h8M9 9h.01M15 9h.01"/></svg>
    </div>
    <p class="ds-empty-title">${escapeHtml(title)}</p>
    ${desc ? `<p class="ds-empty-desc">${escapeHtml(desc)}</p>` : ""}
  </div>`;
}

function buildAllocationSlices(snapshot) {
  const { spark, aave, uniswap, renderData } = snapshot;
  const walletUsd = Math.max(
    0,
    (renderData?.totalAssets || 0) - (spark?.assetsUsd || 0) - (aave?.assetsUsd || 0) - (uniswap?.assetsUsd || 0),
  );
  const debtUsd = (spark?.debtUsd || 0) + (aave?.debtUsd || 0);
  const slices = [];
  if (walletUsd > 0.5) slices.push({ label: "Wallet", value: walletUsd, color: ALLOCATION_COLORS.Wallet });
  if ((spark?.assetsUsd || 0) > 0.5) slices.push({ label: "Spark", value: spark.assetsUsd, color: ALLOCATION_COLORS.Spark });
  if ((aave?.assetsUsd || 0) > 0.5) slices.push({ label: "Aave", value: aave.assetsUsd, color: ALLOCATION_COLORS.Aave });
  if ((uniswap?.assetsUsd || 0) > 0.5) slices.push({ label: "Uniswap", value: uniswap.assetsUsd, color: ALLOCATION_COLORS.Uniswap });
  if (debtUsd > 0.5) slices.push({ label: "Debt", value: debtUsd, color: ALLOCATION_COLORS.Debt });
  return slices;
}

function netWorthHistoryKey() {
  const wallets = window.BankirrWallets?.list?.map((w) => w.address.toLowerCase()).sort();
  if (wallets?.length) return `bankirr_nw_${wallets.join(",")}`;
  if (state.address) return `bankirr_nw_${state.address.toLowerCase()}`;
  return "bankirr_nw_default";
}

function readNetWorthHistory() {
  try {
    const raw = localStorage.getItem(netWorthHistoryKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeNetWorthHistory(points) {
  try {
    localStorage.setItem(netWorthHistoryKey(), JSON.stringify(points.slice(-NW_HISTORY_MAX)));
  } catch {}
}

function recordNetWorthHistory(netWorth, fetchedAt) {
  if (!Number.isFinite(netWorth) || netWorth <= 0) return;
  const points = readNetWorthHistory();
  const last = points[points.length - 1];
  const hourMs = 60 * 60 * 1000;
  if (last && fetchedAt - last.t < hourMs && Math.abs(last.value - netWorth) < 0.01) return;
  points.push({ t: fetchedAt, value: netWorth });
  writeNetWorthHistory(points);
}

function historyForChart(netWorth) {
  const points = readNetWorthHistory();
  if (points.length >= 2) return points;
  const now = Date.now();
  const val = points[0]?.value ?? netWorth;
  return [
    { t: now - 7 * 24 * 60 * 60 * 1000, value: val * 0.97 },
    { t: now, value: netWorth },
  ];
}

function shouldShowAllocation() {
  if (!window._clientProfile) return true;
  return (window._clientProfile.show_allocation ?? 1) !== 0;
}

function shouldShowNetWorthHistory() {
  if (!window._clientProfile) return true;
  return (window._clientProfile.show_growth_chart ?? 1) !== 0;
}

function renderPortfolioViz(snapshot) {
  lastSnapshot = snapshot;
  const netWorth = snapshot.renderData?.netWorth || 0;
  recordNetWorthHistory(netWorth, snapshot.fetchedAt || Date.now());
  const history = historyForChart(netWorth);
  renderHeroSparkline(history);
  const slices = buildAllocationSlices(snapshot);
  const showAlloc = shouldShowAllocation() && slices.length > 0;
  if (els.allocationModule) els.allocationModule.hidden = !showAlloc;
  if (showAlloc) renderAllocationChart(slices);
  const showHistory = shouldShowNetWorthHistory() && netWorth > 0;
  if (els.netWorthHistoryModule) els.netWorthHistoryModule.hidden = !showHistory;
  if (showHistory) renderNetWorthHistoryChart(history);
}

function renderHeroSparkline(points) {
  const canvas = els.heroSparkline;
  if (!canvas || !points.length) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 140;
  const H = 48;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#1de9c6";
  const scX = (i) => (i / Math.max(points.length - 1, 1)) * W;
  const scY = (v) => H - 4 - ((v - minV) / range) * (H - 8);
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(scX(i), scY(p.value)) : ctx.lineTo(scX(i), scY(p.value))));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, primary + "33");
  grad.addColorStop(1, primary + "00");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = primary;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(scX(i), scY(p.value)) : ctx.lineTo(scX(i), scY(p.value))));
  ctx.stroke();
}

function renderAllocationChart(slices) {
  const canvas = els.allocationCanvas;
  const legend = els.allocationLegend;
  if (!canvas || !legend) return;
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  const size = 120;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const inner = outer * 0.58;
  let angle = -Math.PI / 2;
  slices.forEach((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, angle, angle + sweep);
    ctx.arc(cx, cy, inner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    angle += sweep;
  });
  legend.innerHTML = slices
    .map((slice) => {
      const pct = ((slice.value / total) * 100).toFixed(1);
      return `<div class="allocation-legend-item">
        <span class="allocation-legend-dot" style="background:${slice.color}"></span>
        <span>${escapeHtml(slice.label)}</span>
        <strong>${pct}% · ${fmtUsd(slice.value, { compact: true })}</strong>
      </div>`;
    })
    .join("");
}

function renderNetWorthHistoryChart(points) {
  const canvas = els.netWorthHistoryCanvas;
  if (!canvas || points.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 480;
  const H = 160;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const values = points.map((p) => p.value);
  const minV = Math.min(...values) * 0.995;
  const maxV = Math.max(...values) * 1.005;
  const range = maxV - minV || 1;
  const scX = (i) => padL + (i / (points.length - 1)) * cW;
  const scY = (v) => padT + cH - ((v - minV) / range) * cH;
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#1de9c6";
  for (let i = 0; i <= 3; i++) {
    const y = padT + (i / 3) * cH;
    ctx.strokeStyle = "rgba(26,46,43,0.7)";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    const v = maxV - (i / 3) * range;
    ctx.fillStyle = "rgba(107,136,130,0.65)";
    ctx.font = "9px 'Space Grotesk', sans-serif";
    ctx.textAlign = "right";
    const label = v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v)}`;
    ctx.fillText(label, padL - 4, y + 3);
  }
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(scX(i), scY(p.value)) : ctx.lineTo(scX(i), scY(p.value))));
  ctx.lineTo(scX(points.length - 1), padT + cH);
  ctx.lineTo(scX(0), padT + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, H);
  grad.addColorStop(0, primary + "28");
  grad.addColorStop(1, primary + "00");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = primary;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(scX(i), scY(p.value)) : ctx.lineTo(scX(i), scY(p.value))));
  ctx.stroke();
}

function applyPortfolioSnapshot(snapshot) {
  const isLoggedIn = typeof window.BankirrAuth?.isLoggedIn === "function" ? window.BankirrAuth.isLoggedIn() : false;
  const walletCount = window.BankirrWallets?.list?.length || 0;
  const dashboardHidden = els.dashboardShell?.classList.contains("is-hidden") || false;
  if (!isLoggedIn && walletCount === 0 && dashboardHidden) return;
  state.address = snapshot.address;
  state.ens = snapshot.ens || "";
  state.ethUsd = snapshot.market?.ethUsd || state.ethUsd;
  state.sourceErrors = snapshot.sourceErrors || {};
  renderWalletAssets(snapshot.nativeAssets);
  renderSpark(snapshot.spark);
  renderAave(snapshot.aave);
  renderUniswap(snapshot.uniswap);
  renderDefiEmptyState(snapshot.nativeAssets, snapshot.spark, snapshot.aave, snapshot.uniswap);
  renderTotals(snapshot.renderData);
  renderPortfolioViz(snapshot);
  state.lastUpdated = new Date(snapshot.fetchedAt);
  state.timestamps.wallet = new Date(snapshot.fetchedAt);
  renderTimestamps();
  els.updatedAt.textContent = `${new Date(snapshot.fetchedAt).toLocaleString()} · ${formatCacheAge(snapshot.fetchedAt)}`;
}

function updateWalletLabels(address, ens) {
  if (clientHidesWalletNumbers()) return;
  els.walletLabel.textContent = shortAddress(address);
  els.connectedWalletLabel.textContent = shortAddress(address);
  els.ensLabel.textContent = ens || "—";
}

function updateMultiWalletLabels(addresses) {
  if (clientHidesWalletNumbers()) return;
  const walletLabels = addresses.map((a, i) => {
    const bw = window.BankirrWallets?.list?.[i];
    return bw?.label || (a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a);
  });
  els.walletLabel.textContent = walletLabels.join(", ");
  els.ensLabel.textContent = addresses.length + " wallets";
}

async function loadPortfolio(address, ens = "", options = {}) {
  const loadGen = portfolioLoadGen;
  const cacheKey = address.toLowerCase();
  const cached = options.forceRefresh ? null : PortfolioCache.getPortfolio(cacheKey);
  const skipFetch = cached && Date.now() - cached.fetchedAt < PortfolioCache.SKIP_FETCH_MS;

  setBusy(true);
  clearLoadProgress();
  revealDashboard();
  state.address = address;
  state.ens = ens;

  if (cached) {
    if (isPortfolioLoadStale(loadGen)) return;
    applyPortfolioSnapshot(cached);
    updateWalletLabels(address, ens);
    if (skipFetch) {
      if (isPortfolioLoadStale(loadGen)) return;
      setStatus(`Portfolio loaded · updated ${formatCacheAge(cached.fetchedAt)}`);
      setBusy(false);
      return;
    }
    setStatus("Updating portfolio…");
  } else {
    setStatus("Resolving on-chain positions and market prices…");
    resetUi(address, ens);
  }
  setLoadProgressIndeterminate(true);

  try {
    await getProvider();
    if (isPortfolioLoadStale(loadGen)) return;
    const sparkReserveTokens = await getSparkReserveTokenList(options).catch(() => []);
    const market = await loadMarketData(sparkReserveTokens, options);

    const live = {
      nativeAssets: cached?.nativeAssets || emptyNativeBalances(),
      spark: cached?.spark || emptySpark(),
      aave: cached?.aave || emptyAave(),
      uniswap: cached?.uniswap || emptyUniswap(),
    };
    state.sourceErrors = {};
    state.ethUsd = market.ethUsd || state.ethUsd;

    const renderLive = () => {
      if (isPortfolioLoadStale(loadGen)) return;
      renderWalletAssets(live.nativeAssets);
      renderSpark(live.spark);
      renderAave(live.aave);
      renderUniswap(live.uniswap);
      renderDefiEmptyState(live.nativeAssets, live.spark, live.aave, live.uniswap);
      renderTotals(buildPortfolioRenderData(live.nativeAssets, live.spark, live.aave, live.uniswap));
      state.timestamps.wallet = new Date();
      renderTimestamps();
    };

    let doneCount = 0;
    const totalSources = 4;
    const updateProgress = () => {
      if (isPortfolioLoadStale(loadGen)) return;
      setLoadProgress(doneCount, totalSources, Object.keys(state.sourceErrors).length ? "warning" : "");
      if (!cached) setStatus(`Loading portfolio… ${doneCount}/${totalSources}`);
      else setStatus(`Updating portfolio… ${doneCount}/${totalSources}`);
    };
    updateProgress();

    const sourceJobs = [
      {
        key: "nativeAssets",
        errorKey: "native",
        promise: loadWalletBalancesCached(address, market, options),
        fallback: emptyNativeBalances,
      },
      {
        key: "spark",
        errorKey: "spark",
        promise: withTimeout(loadSpark(address, market), 25000, "Spark"),
        fallback: emptySpark,
      },
      {
        key: "aave",
        errorKey: "aave",
        promise: loadAave(address, market),
        fallback: emptyAave,
      },
      {
        key: "uniswap",
        errorKey: "liquidity",
        promise: loadLiquidityPools(address, market, {
          onPartial: (partial) => {
            live.uniswap = partial;
            renderLive();
          },
        }),
        fallback: emptyUniswap,
      },
    ];

    await Promise.all(
      sourceJobs.map(async (job) => {
        try {
          live[job.key] = await job.promise;
          if (job.key === "uniswap") {
            const failedScans = live.uniswap.failedScans || [];
            const hasPositions = (live.uniswap.positions || []).length > 0;
            if (!hasPositions && failedScans.length > 0) {
              state.sourceErrors.liquidity =
                "Liquidity API unavailable. Restart backend: PORT=3200 npm start";
            } else if (failedScans.length > 0) {
              state.sourceErrors.liquidity = `Partial liquidity load (${failedScans.length} scans failed)`;
            }
          }
        } catch (error) {
          state.sourceErrors[job.errorKey] = friendlyError(error);
          live[job.key] = job.fallback();
        } finally {
          doneCount += 1;
          renderLive();
          updateProgress();
        }
      }),
    );

    if (isPortfolioLoadStale(loadGen)) return;

    const snapshot = buildPortfolioSnapshot(address, ens, live.nativeAssets, live.spark, live.aave, live.uniswap, market);
    snapshot.sourceErrors = { ...state.sourceErrors };
    PortfolioCache.setPortfolio(cacheKey, snapshot);
    // Keep final timestamp tied to completed full refresh.
    applyPortfolioSnapshot(snapshot);

    const warnings = Object.keys(state.sourceErrors);
    setStatus(
      warnings.length
        ? `Updated · unavailable: ${warnings.join(", ")}`
        : `Portfolio updated · ${formatCacheAge(snapshot.fetchedAt)}`,
      warnings.length ? "warning" : "",
    );
  } catch (error) {
    if (isPortfolioLoadStale(loadGen)) return;
    if (!cached) renderLoadError(error.message);
    setStatus(cached ? `Update failed · showing cached data (${formatCacheAge(cached.fetchedAt)})` : error.message, "negative");
  } finally {
    if (!isPortfolioLoadStale(loadGen)) {
      clearLoadProgress();
      setBusy(false);
    }
  }
}

function resetUi(address, ens) {
  state.sourceErrors = {};
  if (!clientHidesWalletNumbers()) {
    els.walletLabel.textContent = shortAddress(address);
    els.connectedWalletLabel.textContent = shortAddress(address);
    els.ensLabel.textContent = ens || "—";
  }
  els.updatedAt.textContent = "Loading…";
  setHeroLoading();
  els.dailyPnl.textContent = "—";
  els.blendedApr.textContent = "—";
  els.walletAssetsSection.hidden = false;
  els.walletAssetRows.innerHTML = `<tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr><td colspan="5" class="loading-row"><span class="loading-pulse">Fetching tokens…</span></td></tr>`;
  els.sparkSection.hidden = false;
  els.sparkSupplyBlock.hidden = false;
  els.sparkBorrowBlock.hidden = false;
  els.aaveSection.hidden = false;
  els.aaveSupplyBlock.hidden = false;
  els.aaveBorrowBlock.hidden = false;
  els.uniswapSection.hidden = false;
  els.defiEmptyState.hidden = true;
  els.sparkSupplyRows.innerHTML = `<tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr><td colspan="5" class="loading-row"><span class="loading-pulse">Loading Spark positions…</span></td></tr>`;
  els.sparkBorrowRows.innerHTML = `<tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr><td colspan="5" class="loading-row"><span class="loading-pulse">Loading Spark debt…</span></td></tr>`;
  els.aaveSupplyRows.innerHTML = `<tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr><td colspan="6" class="loading-row"><span class="loading-pulse">Loading Aave positions…</span></td></tr>`;
  els.aaveBorrowRows.innerHTML = `<tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr class="skeleton-row"><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td><td>————————</td></tr>
      <tr><td colspan="6" class="loading-row"><span class="loading-pulse">Loading Aave debt…</span></td></tr>`;
  els.uniswapPositions.innerHTML = `<div class="loading-row"><span class="loading-pulse">Fetching Uniswap LP positions…</span></div>`;
}

function renderLoadError(message) {
  els.updatedAt.textContent = "Load failed";
  if (els.heroNetWorth) {
    els.heroNetWorth.textContent = "Load failed";
    els.heroNetWorth.classList.remove("skeleton-text", "skeleton-text--hero");
  }
  if (els.heroNetWorthEth) els.heroNetWorthEth.textContent = "—";
  [els.heroDailyIncome, els.heroYearlyIncome].forEach((el) => { if (el) el.textContent = "—"; });
  [els.heroDailyIncomePct, els.heroDailyIncomeEth, els.heroYearlyIncomePct, els.heroYearlyIncomeEth].forEach((el) => {
    if (el) el.textContent = "—";
  });
  els.walletAssetRows.innerHTML = emptyRow(5, "Wallet balances did not load.");
  els.sparkSupplyRows.innerHTML = emptyRow(5, "Spark data did not load.");
  els.sparkBorrowRows.innerHTML = emptyRow(5, "Spark data did not load.");
  els.aaveSupplyRows.innerHTML = emptyRow(6, "Aave data did not load.");
  els.aaveBorrowRows.innerHTML = emptyRow(6, "Aave data did not load.");
  els.uniswapPositions.innerHTML = `<div class="empty">Uniswap data did not load.</div>`;
  els.sourceTimestamps.innerHTML = `<div>${escapeHtml(friendlyError(message))}</div>`;
}

function renderTotalsCore(data) {
  const netWorthEth = state.ethUsd > 0 ? data.netWorth / state.ethUsd : NaN;
  animateValue(els.heroNetWorth, data.netWorth, (v) => fmtUsd(v), 700);
  if (els.heroNetWorthEth) {
    els.heroNetWorthEth.textContent = `${fmtNumber(netWorthEth, 4)} ETH estimated equity`;
  }
  setSignedUsd(els.heroDailyIncome, data.netDaily);
  if (els.heroDailyIncomeEth) {
    els.heroDailyIncomeEth.textContent = `${fmtNumber(state.ethUsd > 0 ? data.netDaily / state.ethUsd : NaN, 6)} ETH/day`;
  }
  if (els.heroDailyIncomePct) {
    els.heroDailyIncomePct.textContent = `${fmtPct(data.blendedApr / 365, 3)} daily`;
  }
  setSignedUsd(els.heroYearlyIncome, data.netDaily * 365);
  if (els.heroYearlyIncomeEth) {
    els.heroYearlyIncomeEth.textContent = `${fmtNumber(state.ethUsd > 0 ? (data.netDaily * 365) / state.ethUsd : NaN, 4)} ETH/year`;
  }
  if (els.heroYearlyIncomePct) {
    els.heroYearlyIncomePct.textContent = `${fmtPct(data.blendedApr, 2)} APR`;
  }
  setSignedUsd(els.dailyPnl, data.netDaily);
  animateValue(els.blendedApr, data.blendedApr, (v) => fmtPct(v));
  if (clientShowsHealthFactor()) renderHealthFactor(data.healthFactor);

  els.summaryTotal.textContent = signedUsd(data.netDaily);
  els.summaryTotal.className = data.netDaily >= 0 ? "positive" : "negative";
  renderBars(data.contributions);
  els.updatedAt.textContent = new Date().toLocaleString();
}

function groupBalancesByChain(balances) {
  const groups = new Map();
  balances.forEach((row) => {
    const key = row.network || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].sort((a, b) => {
    const totalA = a[1].reduce((s, r) => s + r.valueUsd, 0);
    const totalB = b[1].reduce((s, r) => s + r.valueUsd, 0);
    return totalB - totalA;
  });
}

function renderWalletAssets(nativeAssets) {
  lastNativeAssets = nativeAssets;
  ensureHoldingsFilterUI();
  const allBalances = nativeAssets.balances || [];
  const balances = filterHoldingsBalances(allBalances);
  const hasBalances = balances.length > 0;
  const hasAny = allBalances.length > 0;
  els.walletAssetsSection.hidden = !hasAny;
  if (!hasAny) return;

  const filteredSubtotal = balances.reduce((sum, row) => sum + row.valueUsd, 0);
  const filterLabel = HOLDINGS_FILTERS.find((f) => f.id === holdingsFilter)?.label;
  els.walletAssetsNet.textContent =
    holdingsFilter === "all"
      ? fmtUsd(nativeAssets.assetsUsd)
      : `${fmtUsd(filteredSubtotal)} · ${filterLabel}`;
  const hideAddr = clientHidesWalletNumbers();
  const hideDust = hideDustEnabled();
  const dustHidden = hideDust && allBalances.length > balances.length;
  const tierHidden = holdingsFilter !== "all" && allBalances.length > balances.length;

  if (!hasBalances) {
    let message = "No wallet balances found.";
    if (tierHidden) {
      message = `No ${filterLabel?.toLowerCase() || "matching"} holdings — try another filter.`;
    } else if (dustHidden) {
      message = "All balances are below $1 — uncheck “Hide dust” to show them.";
    }
    els.walletAssetRows.innerHTML = emptyRow(5, message);
    return;
  }

  const chainGroups = groupBalancesByChain(balances);
  els.walletAssetRows.innerHTML = chainGroups
    .map(([network, rows]) => {
      const subtotal = rows.reduce((s, r) => s + r.valueUsd, 0);
      const rowHtml = rows
        .map(
          (row) => `<tr>
        <td>${chainBadge(row.network)}</td>
        <td${!hideAddr && row.contractAddress ? ` title="${escapeHtml(row.contractAddress)}"` : ""}>${escapeHtml(row.symbol)}</td>
        <td>${fmtNumber(row.balance, 6)}</td>
        <td>${fmtUsd(row.priceUsd)}</td>
        <td>${fmtUsd(row.valueUsd)}</td>
      </tr>`,
        )
        .join("");
      return `${rowHtml}
      <tr class="chain-subtotal-row">
        <td colspan="4">${chainBadge(network)} subtotal</td>
        <td>${fmtUsd(subtotal)}</td>
      </tr>`;
    })
    .join("");
}

function renderSpark(spark) {
  const hasSupplies = spark.supplies.length > 0;
  const hasBorrows = spark.borrows.length > 0;
  els.sparkSection.hidden = !(hasSupplies || hasBorrows);
  els.sparkSupplyBlock.hidden = !hasSupplies;
  els.sparkBorrowBlock.hidden = !hasBorrows;
  if (els.sparkSection.hidden) return;

  els.sparkNet.textContent = signedUsd(spark.daily);
  els.sparkNet.className = spark.daily >= 0 ? "positive" : "negative";
  els.sparkSupplyMeta.textContent = `${spark.supplies.length} active`;
  els.sparkBorrowMeta.textContent = `${spark.borrows.length} active`;
  if (spark.supplies.length) {
    const totalUsd = spark.supplies.reduce((s, r) => s + r.valueUsd, 0);
    const totalDaily = spark.supplies.reduce((s, r) => s + r.daily, 0);
    els.sparkSupplyRows.innerHTML =
      spark.supplies.map((row) => `<tr>
        <td>${escapeHtml(row.symbol)}${row.note ? `<br><small>${escapeHtml(row.note)}</small>` : ""}</td>
        <td>${fmtNumber(row.balance, 6)}</td>
        <td>${fmtUsd(row.valueUsd)}</td>
        <td>${fmtPct(row.supplyApy)}</td>
        <td class="positive">${signedUsd(row.daily)}</td>
      </tr>`).join("") +
      `<tr class="total-row">
        <td colspan="2" class="total-label">Total Collateral</td>
        <td>${fmtUsd(totalUsd)}</td>
        <td>—</td>
        <td class="positive">${signedUsd(totalDaily)}</td>
      </tr>`;
  } else {
    els.sparkSupplyRows.innerHTML = "";
  }

  if (spark.borrows.length) {
    const totalUsd = spark.borrows.reduce((s, r) => s + r.valueUsd, 0);
    const totalDaily = spark.borrows.reduce((s, r) => s + r.daily, 0);
    els.sparkBorrowRows.innerHTML =
      spark.borrows.map((row) => `<tr>
        <td>${escapeHtml(row.symbol)}</td>
        <td>${fmtNumber(row.balance, 6)}</td>
        <td>${fmtUsd(row.valueUsd)}</td>
        <td>${fmtPct(row.borrowApr)}</td>
        <td class="negative">${signedUsd(-row.daily)}</td>
      </tr>`).join("") +
      `<tr class="total-row">
        <td colspan="2" class="total-label">Total Debt</td>
        <td>${fmtUsd(totalUsd)}</td>
        <td>—</td>
        <td class="negative">${signedUsd(-totalDaily)}</td>
      </tr>`;
  } else {
    els.sparkBorrowRows.innerHTML = "";
  }
}

function renderAave(aave) {
  const hasSupplies = aave.supplies.length > 0;
  const hasBorrows = aave.borrows.length > 0;
  els.aaveSection.hidden = !(hasSupplies || hasBorrows);
  els.aaveSupplyBlock.hidden = !hasSupplies;
  els.aaveBorrowBlock.hidden = !hasBorrows;
  if (els.aaveSection.hidden) return;

  els.aaveNet.textContent = signedUsd(aave.daily);
  els.aaveNet.className = aave.daily >= 0 ? "positive" : "negative";
  els.aaveSupplyMeta.textContent = `${aave.supplies.length} active`;
  els.aaveBorrowMeta.textContent = `${aave.borrows.length} active`;
  if (aave.supplies.length) {
    const totalUsd = aave.supplies.reduce((s, r) => s + r.valueUsd, 0);
    const totalDaily = aave.supplies.reduce((s, r) => s + r.daily, 0);
    els.aaveSupplyRows.innerHTML =
      aave.supplies.map((row) => `<tr>
        <td>${escapeHtml(row.network)}</td>
        <td>${escapeHtml(row.symbol)}</td>
        <td>${fmtNumber(row.balance, 6)}</td>
        <td>${fmtUsd(row.valueUsd)}</td>
        <td>${fmtPct(row.supplyApy)}</td>
        <td class="positive">${signedUsd(row.daily)}</td>
      </tr>`).join("") +
      `<tr class="total-row">
        <td colspan="3" class="total-label">Total Collateral</td>
        <td>${fmtUsd(totalUsd)}</td>
        <td>—</td>
        <td class="positive">${signedUsd(totalDaily)}</td>
      </tr>`;
  } else {
    els.aaveSupplyRows.innerHTML = "";
  }

  if (aave.borrows.length) {
    const totalUsd = aave.borrows.reduce((s, r) => s + r.valueUsd, 0);
    const totalDaily = aave.borrows.reduce((s, r) => s + r.daily, 0);
    els.aaveBorrowRows.innerHTML =
      aave.borrows.map((row) => `<tr>
        <td>${escapeHtml(row.network)}</td>
        <td>${escapeHtml(row.symbol)}</td>
        <td>${fmtNumber(row.balance, 6)}</td>
        <td>${fmtUsd(row.valueUsd)}</td>
        <td>${fmtPct(row.borrowApr)}</td>
        <td class="negative">${signedUsd(-row.daily)}</td>
      </tr>`).join("") +
      `<tr class="total-row">
        <td colspan="3" class="total-label">Total Debt</td>
        <td>${fmtUsd(totalUsd)}</td>
        <td>—</td>
        <td class="negative">${signedUsd(-totalDaily)}</td>
      </tr>`;
  } else {
    els.aaveBorrowRows.innerHTML = "";
  }
}

function renderUniswap(uniswap) {
  els.uniswapSection.hidden = uniswap.positions.length === 0;
  if (els.uniswapSection.hidden) return;

  const totalValue = uniswap.assetsUsd ||
    uniswap.positions.reduce((sum, position) => sum + (position.valueUsd || 0) + (position.unclaimedFeesUsd || 0), 0);
  if (els.uniswapAssets) els.uniswapAssets.textContent = fmtUsd(totalValue);
  if (els.uniswapNet) {
    els.uniswapNet.textContent = `${signedUsd(uniswap.daily)}/day`;
    els.uniswapNet.className = `summary-sub ${uniswap.daily >= 0 ? "positive" : "negative"}`;
  }

  const scanNote =
    uniswap.scanProgress && uniswap.scanProgress.completed < uniswap.scanProgress.total
      ? `<div class="empty">LP scans ${uniswap.scanProgress.completed}/${uniswap.scanProgress.total}…</div>`
      : "";
  const totalUnclaimed = uniswap.positions.reduce((sum, position) => sum + Number(position.unclaimedFeesUsd || 0), 0);
  const totalDaily = uniswap.positions.reduce((sum, position) => sum + Number(position.daily || 0), 0);
  const totalBar = `<div class="lp-total-bar">
    <span>${uniswap.positions.length} open position${uniswap.positions.length === 1 ? "" : "s"}</span>
    <strong>${fmtUsd(totalValue)}</strong>
    <span>Σ Fees ${fmtUsd(totalUnclaimed)} · Σ Day ${signedUsd(totalDaily)}</span>
  </div>`;
  els.uniswapPositions.innerHTML = uniswap.positions.length
    ? totalBar +
      uniswap.positions
        .map((position) => {
          const pairLabel = escapeHtml(normalizePairName(position.pair || ""));
          const hasTickRange = position.protocol === "v3" || position.protocol === "v4";
          const protocolBadge = position.protocol ? escapeHtml(position.protocol.toUpperCase()) : "LP";
          const rangeBlock = hasTickRange
            ? `<div class="metric"><span>Current Tick</span><strong>${fmtNumber(position.tick, 0)}</strong></div>
              <div class="metric"><span>Range</span><strong>${fmtNumber(position.tickLower, 0)} → ${fmtNumber(position.tickUpper, 0)}</strong></div>`
            : "";
          const v2Block =
            position.protocol === "v2"
              ? `<div class="metric"><span>Staking Rewards</span><strong>${fmtUsd(position.stakingRewardsUsd || 0)}</strong></div>`
              : "";
          return `<article class="position-card">
            <div class="position-head">
              <div class="position-title">
                ${renderPairIcons({ ...position, pair: pairLabel })}
                <div>
                  <strong>${pairLabel}</strong>
                  <small>${escapeHtml(position.network)} · ${protocolBadge} · ${escapeHtml(formatPositionRef(position))} · ${fmtPct(position.feeTier, 2)} fee</small>
                </div>
              </div>
              <span class="pill ${position.inRange ? "positive" : "warning"}">${position.inRange ? "In range" : "Out of range"}</span>
            </div>
            <div class="metric-grid">
              <div class="metric"><span>Position Value</span><strong>${fmtUsd(position.valueUsd)}</strong></div>
              <div class="metric"><span>Pool PnL</span><strong class="${Number(position.poolPnlUsd ?? position.pnlUsd) >= 0 ? "positive" : "negative"}">${Number.isFinite(Number(position.poolPnlUsd ?? position.pnlUsd)) ? signedUsd(Number(position.poolPnlUsd ?? position.pnlUsd)) : "—"}</strong><small class="metric-sub">Total PnL: ${Number.isFinite(Number(position.totalPnlUsd ?? position.pnlUsd)) ? signedUsd(Number(position.totalPnlUsd ?? position.pnlUsd)) : "—"}</small></div>
              <div class="metric"><span>Unclaimed Fees</span><strong>${fmtUsd(position.unclaimedFeesUsd)}</strong></div>
              <div class="metric"><span>Fee APR</span><strong>${fmtPct(position.feeApr)}</strong></div>
              <div class="metric"><span>Avg Fees / Day</span><strong class="positive">${signedUsd(position.daily)}</strong></div>
              ${rangeBlock}
              <div class="metric"><span>7D Volume</span><strong>${fmtUsd(position.volume7dUsd, { compact: true })}</strong></div>
              <div class="metric"><span>Pool Fees / Day</span><strong>${fmtUsd(position.poolDailyFeesUsd)}</strong></div>
              <div class="metric"><span>Liquidity Share</span><strong>${fmtPct((position.liquidityShare || 0) * 100, 4)}</strong></div>
              ${v2Block}
              <div class="metric"><span>IL vs HODL</span><strong class="warning">${escapeHtml(position.ilNote)}</strong></div>
              <div class="metric"><span>Source</span><strong>${escapeHtml(position.source || "Revert")}</strong></div>
            </div>
          </article>`;
        })
        .join("") + scanNote
    : scanNote;
}

function renderDefiEmptyState(nativeAssets, spark, aave, uniswap) {
  const hasPositions =
    nativeAssets.balances.length > 0 ||
    spark.supplies.length > 0 ||
    spark.borrows.length > 0 ||
    aave.supplies.length > 0 ||
    aave.borrows.length > 0 ||
    uniswap.positions.length > 0;
  els.defiEmptyState.hidden = hasPositions;
}

function renderBars(contributions) {
  const visibleContributions = contributions.filter((item) => Number.isFinite(item.value) && Math.abs(item.value) > 0.000001);
  if (visibleContributions.length === 0) {
    els.pnlBars.innerHTML = emptyStateHtml({
      title: "No active positions",
      desc: "No earning or cost positions found across checked protocols.",
    });
    return;
  }
  const maxAbs = Math.max(...visibleContributions.map((item) => Math.abs(item.value)), 1);
  els.pnlBars.innerHTML = visibleContributions
    .map((item) => {
      const width = Math.max((Math.abs(item.value) / maxAbs) * 50, item.value === 0 ? 0 : 1);
      const offset = item.value < 0 ? 50 - width : 50;
      const color = item.value < 0 ? "var(--color-negative)" : "var(--color-positive)";
      return `<div class="bar-row">
        <span>${item.label}</span>
        <div class="bar-track"><span class="bar-fill" style="--width:${width}%;--offset:${offset}%;--bar-color:${color}"></span></div>
        <strong class="${item.value >= 0 ? "positive" : "negative"}">${signedUsd(item.value)}</strong>
      </div>`;
    })
    .join("");
}

function renderTimestamps() {
  const rows = Object.entries(state.timestamps).map(([source, date]) => {
    return `<div>${escapeHtml(source)}: ${date.toLocaleTimeString()}</div>`;
  });
  Object.entries(state.sourceErrors).forEach(([source, message]) => {
    rows.push(`<div>${escapeHtml(source)}: unavailable (${escapeHtml(message)})</div>`);
  });
  els.sourceTimestamps.innerHTML = rows.join("");
}

function friendlyError(error) {
  const message = typeof error === "string" ? error : error?.reason || error?.shortMessage || error?.message || "Unknown error";
  if (message.includes("Batch of more than 3 requests")) return "RPC free tier rejected batched reads";
  if (message.includes("timed out")) return message;
  if (message.includes("AbortError")) return "request timed out";
  if (message.includes("rate-limited")) return "RPC rate limited";
  if (message.includes("zero address")) return "zero address is not a valid owner query";
  if (message.includes("Failed to fetch")) return "network request failed";
  return message.length > 180 ? `${message.slice(0, 177)}…` : message;
}

function emptyRow(colspan, message) {
  return `<tr><td class="empty" colspan="${colspan}">${message}</td></tr>`;
}

function signedUsd(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${fmtUsd(Math.abs(value))}`;
}

const SPHERE_MOBILE_HEADER = 96;
const SPHERE_MOBILE_SCALE = 1.6;
const SPHERE_MOBILE_SIZE = 0.67;
const SPHERE_POINT_COUNT_DESKTOP = 260;
const SPHERE_POINT_COUNT_MOBILE = 80;
const SPHERE_CAMERA_FOV = 42;

function isIntroMobileLayout() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function getSphereViewport(canvas) {
  const isMobile = isIntroMobileLayout();
  const parent = canvas?.parentElement;
  if (!parent) {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      isMobile,
    };
  }
  const width = Math.max(parent.clientWidth, 1);
  const height = isMobile
    ? Math.max(parent.clientHeight - SPHERE_MOBILE_HEADER, 80)
    : Math.max(parent.clientHeight, 1);
  return { width, height, isMobile };
}

function syncSphereCanvasDisplay(canvas, isMobile) {
  if (isMobile) return;
  canvas.style.width = "";
  canvas.style.height = "";
  canvas.style.top = "";
  canvas.style.left = "";
  canvas.style.right = "";
  canvas.style.bottom = "";
}

function scheduleSphereResize(resize) {
  resize();
  requestAnimationFrame(resize);
  window.setTimeout(resize, 120);
}

function createFibonacciSpherePoints(count, radius = 2.25) {
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (index / (count - 1)) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const theta = index * Math.PI * (3 - Math.sqrt(5));
    return {
      x: Math.cos(theta) * ringRadius * radius,
      y: y * radius,
      z: Math.sin(theta) * ringRadius * radius,
    };
  });
}

function getSpherePointCount(isMobile) {
  return isMobile ? SPHERE_POINT_COUNT_MOBILE : SPHERE_POINT_COUNT_DESKTOP;
}

function getDesktopSphereFormGap() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--sphere-desktop-form-gap");
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 132;
}

function getDesktopSphereRadiusPx(panelWidth, panelHeight, { cameraZ = 7.5, scale = 1, renderScale = null } = {}) {
  if (renderScale != null) return renderScale * 1.12;
  const vFov = (SPHERE_CAMERA_FOV * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * cameraZ;
  const sphereWorldRadius = 2.25 * scale;
  return (sphereWorldRadius / visibleHeight) * panelHeight;
}

function getDesktopSphereCenterX(panelWidth, panelHeight, options = {}) {
  const gap = getDesktopSphereFormGap();
  const radiusPx = getDesktopSphereRadiusPx(panelWidth, panelHeight, options);
  const minCenter = radiusPx + 88;
  const targetCenter = panelWidth - gap - radiusPx;
  return Math.max(minCenter, targetCenter);
}

function getDesktopSphereOffsetX(panelWidth, panelHeight, cameraZ, scale = 1) {
  const centerX = getDesktopSphereCenterX(panelWidth, panelHeight, { cameraZ, scale });
  const pixelOffset = centerX - panelWidth / 2;
  const vFov = (SPHERE_CAMERA_FOV * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * cameraZ;
  const visibleWidth = visibleHeight * (panelWidth / panelHeight);
  return (pixelOffset / panelWidth) * visibleWidth;
}

function initNetworkSphere() {
  if (!els.networkSphere) return;
  if (!window.THREE) {
    initCanvasSphereFallback();
    return;
  }

  const THREE = window.THREE;
  const canvas = els.networkSphere;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SPHERE_CAMERA_FOV, 1, 0.1, 100);
  camera.position.z = 7.5;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const group = new THREE.Group();
  scene.add(group);

  const pointMaterial = new THREE.PointsMaterial({
    color: 0x8ff8e5,
    size: 0.028,
    transparent: true,
    opacity: 0.92,
    sizeAttenuation: true,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x25d0b0,
    transparent: true,
    opacity: 0.2,
  });

  let pointMesh = null;
  let lineMesh = null;
  let activePointCount = 0;

  function buildSphereMeshes(pointCount) {
    const vectors = createFibonacciSpherePoints(pointCount).map(
      (point) => new THREE.Vector3(point.x, point.y, point.z),
    );
    const pointPositions = new Float32Array(pointCount * 3);
    vectors.forEach((point, index) => point.toArray(pointPositions, index * 3));

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));

    const linePositions = [];
    for (let i = 0; i < vectors.length; i += 1) {
      const neighbors = [];
      for (let j = i + 1; j < vectors.length; j += 1) {
        const distance = vectors[i].distanceTo(vectors[j]);
        if (distance < 0.47) neighbors.push({ index: j, distance });
      }
      neighbors
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3)
        .forEach((neighbor) => {
          linePositions.push(vectors[i].x, vectors[i].y, vectors[i].z);
          linePositions.push(
            vectors[neighbor.index].x,
            vectors[neighbor.index].y,
            vectors[neighbor.index].z,
          );
        });
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));

    if (pointMesh) {
      group.remove(pointMesh);
      pointMesh.geometry.dispose();
    }
    if (lineMesh) {
      group.remove(lineMesh);
      lineMesh.geometry.dispose();
    }

    pointMesh = new THREE.Points(pointGeometry, pointMaterial);
    lineMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    group.add(lineMesh);
    group.add(pointMesh);
    activePointCount = pointCount;
  }

  function resize() {
    const { width, height, isMobile } = getSphereViewport(canvas);
    if (height < 20) return;
    const pointCount = getSpherePointCount(isMobile);
    if (pointCount !== activePointCount) buildSphereMeshes(pointCount);

    renderer.setSize(width, height, false);
    if (isMobile) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    } else {
      syncSphereCanvasDisplay(canvas, isMobile);
    }
    const cameraZ = isMobile ? 5.95 : 7.5;
    camera.aspect = width / height;
    camera.position.set(0, 0, cameraZ);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    group.scale.setScalar(isMobile ? SPHERE_MOBILE_SCALE : 1);
    group.position.set(
      isMobile ? 0 : getDesktopSphereOffsetX(width, height, cameraZ, 1),
      isMobile ? -0.02 : 0,
      0,
    );
    pointMaterial.size = isMobile ? 0.032 : 0.028;
    pointMaterial.opacity = 0.92;
    lineMaterial.opacity = isMobile ? 0.16 : 0.2;
  }

  function animate(time = 0) {
    group.rotation.y = time * 0.00008;
    group.rotation.x = Math.sin(time * 0.00012) * 0.09;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  scheduleSphereResize(resize);
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    ro.observe(canvas);
  }
  animate();
}

function initCanvasSphereFallback() {
  const canvas = els.networkSphere;
  const context = canvas.getContext("2d");
  const desktopPoints = createFibonacciSpherePoints(150, 1);
  const mobilePoints = createFibonacciSpherePoints(SPHERE_POINT_COUNT_MOBILE, 1);

  let lastBufW = 0;
  let lastBufH = 0;

  function resize() {
    const { width, height, isMobile } = getSphereViewport(canvas);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    if (isMobile) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    } else {
      syncSphereCanvasDisplay(canvas, isMobile);
    }
    lastBufW = width;
    lastBufH = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function animate(time = 0) {
    const { width, height, isMobile } = getSphereViewport(canvas);
    if (width !== lastBufW || height !== lastBufH) resize();
    if (height < 20) {
      requestAnimationFrame(animate);
      return;
    }
    const points = isMobile ? mobilePoints : desktopPoints;
    const scale = Math.min(width, height) * (isMobile ? SPHERE_MOBILE_SIZE : 0.34);
    const centerX = isMobile
      ? width / 2
      : getDesktopSphereCenterX(width, height, { renderScale: scale });
    const centerY = height / 2;
    const lineThreshold = isMobile ? 52 : 58;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = isMobile ? "rgba(37, 208, 176, 0.14)" : "rgba(37, 208, 176, 0.18)";
    context.fillStyle = "rgba(143, 248, 229, 0.9)";

    const projected = points.map((point) => {
      const angle = time * 0.0001;
      const x = point.x * Math.cos(angle) - point.z * Math.sin(angle);
      const z = point.x * Math.sin(angle) + point.z * Math.cos(angle);
      const perspective = 1 / (1.6 - z * 0.26);
      return {
        x: centerX + x * scale * perspective,
        y: centerY + point.y * scale * perspective,
        z,
      };
    });

    for (let i = 0; i < projected.length; i += 1) {
      for (let j = i + 1; j < projected.length; j += 1) {
        const dx = projected[i].x - projected[j].x;
        const dy = projected[i].y - projected[j].y;
        if (Math.hypot(dx, dy) < lineThreshold) {
          context.beginPath();
          context.moveTo(projected[i].x, projected[i].y);
          context.lineTo(projected[j].x, projected[j].y);
          context.stroke();
        }
      }
      context.beginPath();
      context.arc(projected[i].x, projected[i].y, Math.max(1.3, 2.4 + projected[i].z), 0, Math.PI * 2);
      context.fill();
    }
    requestAnimationFrame(animate);
  }

  scheduleSphereResize(resize);
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    ro.observe(canvas);
  }
  animate();
}

async function loadReadOnlyWallet(inputValue) {
  try {
    setBusy(true);
    setStatus("Resolving wallet…");
    const wallet = await resolveWallet(inputValue);
    els.walletInput.value = wallet.address;
    els.introWalletInput.value = wallet.address;
    // Sync to multi-wallet UI
    if (window.BankirrWallets && !window.BankirrWallets.list.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())) {
      window.BankirrWallets.add(wallet.address, wallet.ens || "");
      if (typeof window.renderWalletBar === "function") window.renderWalletBar();
      if (typeof window.renderSidebarWallets === "function") window.renderSidebarWallets();
    }
    await loadPortfolio(wallet.address, wallet.ens);
  } catch (error) {
    setStatus(error.message, "negative");
    setBusy(false);
  }
}

async function connectWalletFlow() {
  const walletProvider = getBrowserWalletProvider();
  if (!walletProvider) {
    if (els.dashboardShell.classList.contains("is-hidden")) {
      revealAddressEntry();
    } else {
      els.walletInput.focus();
    }
    setStatus("Wallet provider was not detected in this browser. Enter an address to continue in read-only mode.", "warning");
    return;
  }
  try {
    setBusy(true);
    const accounts = await walletProvider.request({ method: "eth_requestAccounts" });
    const address = ethers.getAddress(accounts[0]);
    els.walletInput.value = address;
    els.introWalletInput.value = address;
    const wallet = await resolveWallet(address);
    // Sync to multi-wallet UI
    if (window.BankirrWallets && !window.BankirrWallets.list.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())) {
      window.BankirrWallets.add(wallet.address, wallet.ens || "");
      if (typeof window.renderWalletBar === "function") window.renderWalletBar();
      if (typeof window.renderSidebarWallets === "function") window.renderSidebarWallets();
    }
    await loadPortfolio(wallet.address, wallet.ens);
  } catch (error) {
    setStatus(error.message, "negative");
    setBusy(false);
  }
}

initNetworkSphere();

els.loadWallet.addEventListener("click", async () => {
  await loadReadOnlyWallet(els.walletInput.value);
});

els.introLoadWallet.addEventListener("click", async () => {
  await loadReadOnlyWallet(els.introWalletInput.value);
});

// #introAddressToggle was removed in the redesigned intro (the address field is
// always visible in the Wallet view), so guard against it being absent.
els.introAddressToggle?.addEventListener("click", () => {
  revealAddressEntry();
});

els.refreshData.addEventListener("click", async () => {
  if (window.BankirrWallets?.list?.length) return; // auth.js handles refresh for saved wallets
  if (!state.address) {
    setStatus("Load a wallet first.");
    return;
  }
  await loadPortfolio(state.address, state.ens, { forceRefresh: true });
});

els.connectWallet.addEventListener("click", async () => {
  await connectWalletFlow();
});

els.introConnectWallet.addEventListener("click", async () => {
  await connectWalletFlow();
});

els.walletInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.loadWallet.click();
});

els.introWalletInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.introLoadWallet.click();
});

// ─── SIDEBAR NAVIGATION ─────────────────────────────────────────────────────
function initSidebarNav() {
  const navItems = document.querySelectorAll(".nav-item[data-panel]");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      if (item.hidden || item.disabled || item.classList.contains("nav-item--locked")) return;
      const target = item.dataset.panel;
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      const targetPanel = document.getElementById(`panel-${target}`);
      if (targetPanel) targetPanel.classList.add("active");
      if (target === "research") updateResearchMarketData();
      if (target === "admin" && typeof loadAdminPanel === "function") loadAdminPanel();
      if (target === "clientzone" && typeof window.showCZView === "function") window.showCZView(window.BankirrAuth?.isLoggedIn?.() ?? false);
    });
  });
}

function updateResearchMarketData() {
  const ethEl = document.getElementById("researchEthPrice");
  const lidoEl = document.getElementById("researchLidoApr");
  if (ethEl && state.ethUsd > 0) ethEl.textContent = fmtUsd(state.ethUsd);
  if (lidoEl && Number.isFinite(state.lastLidoApr)) lidoEl.textContent = fmtPct(state.lastLidoApr) + " APR";
}

initSidebarNav();

// ─── HEALTH FACTOR GAUGE ─────────────────────────────────────────────────────
function renderHealthFactor(hf) {
  const kpiEl = els.healthFactor.closest(".kpi");
  const isFinite_ = Number.isFinite(hf) && hf !== Infinity;
  const display = hf === Infinity ? "∞" : isFinite_ ? fmtNumber(hf, 2) : "—";

  // No color on the number — always white like other KPIs
  els.healthFactor.textContent = display;
  els.healthFactor.className = "";

  // Build or update gauge
  let gauge = kpiEl.querySelector(".hf-gauge");
  if (!gauge) {
    gauge = document.createElement("div");
    gauge.className = "hf-gauge";
    gauge.innerHTML = `
      <div class="hf-track">
        <div class="hf-fill"></div>
        <div class="hf-liquidation-marker" title="Liquidation at 1.0"></div>
      </div>
      <div class="hf-scale">
        <span class="hf-scale-liq">1.0 liq.</span>
        <span>2</span>
        <span>3</span>
        <span>4+</span>
      </div>
    `;
    kpiEl.appendChild(gauge);
  }

  const fill = gauge.querySelector(".hf-fill");
  // Scale: 1.0 → 0%, 4.0 → 100%
  const MIN_HF = 1.0;
  const MAX_HF = 4.0;
  const pct = isFinite_ ? Math.max(0, Math.min(((hf - MIN_HF) / (MAX_HF - MIN_HF)) * 100, 100)) : 0;
  fill.style.width = pct + "%";
  // Bar color still reflects danger, just the number stays white
  fill.className = "hf-fill" + (isFinite_ ? (hf < 1.05 ? " negative" : hf < 1.5 ? " warning" : "") : "");

  // Liquidation marker is always at left edge (HF=1.0 = 0%)
  const marker = gauge.querySelector(".hf-liquidation-marker");
  marker.style.left = "0%";
}

// ─── MULTI-WALLET AGGREGATION ─────────────────────────────────────────────────
// Called by auth.js when the wallet list changes.
// Loads all addresses in parallel and merges the results into the dashboard.

window.loadPortfolioForAddresses = async function(addresses, options = {}) {
  if (!addresses || !addresses.length) return;
  const loadGen = portfolioLoadGen;

  // Single wallet: use existing flow unchanged
  if (addresses.length === 1) {
    try {
      const wallet = await resolveWallet(addresses[0]);
      await loadPortfolio(wallet.address, wallet.ens, options);
    } catch (e) {
      if (!isPortfolioLoadStale(loadGen)) setStatus(e.message, "negative");
    }
    return;
  }

  const cacheKey = PortfolioCache.multiKey(addresses);
  const cached = options.forceRefresh ? null : PortfolioCache.getPortfolio(cacheKey);
  const skipFetch = cached && Date.now() - cached.fetchedAt < PortfolioCache.SKIP_FETCH_MS;

  setBusy(true);
  clearLoadProgress();
  revealDashboard();

  if (cached) {
    if (isPortfolioLoadStale(loadGen)) return;
    applyPortfolioSnapshot(cached);
    updateMultiWalletLabels(addresses);
    if (skipFetch) {
      if (isPortfolioLoadStale(loadGen)) return;
      setStatus(`Portfolio loaded · updated ${formatCacheAge(cached.fetchedAt)}`);
      setBusy(false);
      return;
    }
    setStatus(`Updating ${addresses.length} wallets…`);
  } else {
    setStatus(`Loading ${addresses.length} wallets…`);
  }
  setLoadProgressIndeterminate(true);

  try {
    await getProvider();
    if (isPortfolioLoadStale(loadGen)) return;
    const sparkReserveTokens = await getSparkReserveTokenList(options).catch(() => []);
    const market = await loadMarketData(sparkReserveTokens, options);
    if (isPortfolioLoadStale(loadGen)) return;
    const merged = {
      nativeAssets: { assetsUsd: 0, balances: [] },
      spark: emptySpark(),
      aave:  emptyAave(),
      uniswap: emptyUniswap(),
    };

    let lowestHF = Infinity;
    const mergeWallet = (d) => {
      if (!d) return;

      merged.nativeAssets.assetsUsd += d.nativeAssets.assetsUsd;
      merged.nativeAssets.balances.push(...(d.nativeAssets.balances || []));

      merged.spark.assetsUsd   += d.spark.assetsUsd;
      merged.spark.debtUsd     += d.spark.debtUsd;
      merged.spark.daily       += d.spark.daily;
      merged.spark.supplyDaily += d.spark.supplyDaily || 0;
      merged.spark.lidoDaily   += d.spark.lidoDaily || 0;
      merged.spark.borrowDaily += d.spark.borrowDaily || 0;
      merged.spark.supplies.push(...d.spark.supplies);
      merged.spark.borrows.push(...d.spark.borrows);
      if (Number.isFinite(d.spark.healthFactor)) lowestHF = Math.min(lowestHF, d.spark.healthFactor);

      merged.aave.assetsUsd    += d.aave.assetsUsd;
      merged.aave.debtUsd      += d.aave.debtUsd;
      merged.aave.daily        += d.aave.daily;
      merged.aave.supplyDaily  += d.aave.supplyDaily || 0;
      merged.aave.borrowDaily  += d.aave.borrowDaily || 0;
      merged.aave.supplies.push(...d.aave.supplies);
      merged.aave.borrows.push(...d.aave.borrows);
      if (Number.isFinite(d.aave.healthFactor)) lowestHF = Math.min(lowestHF, d.aave.healthFactor);

      merged.uniswap.assetsUsd += d.uniswap.assetsUsd;
      merged.uniswap.daily     += d.uniswap.daily;
      merged.uniswap.positions.push(...(d.uniswap.positions || []));
    };

    const buildMergedSnapshot = () => {
      // The lowest health factor across wallets is the one that matters.
      merged.spark.healthFactor = lowestHF;
      merged.aave.healthFactor = lowestHF;
      updateMultiWalletLabels(addresses);
      return buildPortfolioSnapshot(
        addresses[0],
        addresses.length > 1 ? `+${addresses.length - 1} more` : "",
        merged.nativeAssets,
        merged.spark,
        merged.aave,
        merged.uniswap,
        market
      );
    };

    let done = 0;
    state.sourceErrors = {};
    setLoadProgress(0, addresses.length);
    const results = await settleWithConcurrency(addresses, 4, async (addr) => {
      if (isPortfolioLoadStale(loadGen)) return null;
      const data = await loadSingleWalletData(addr, market, sparkReserveTokens, options);
      if (isPortfolioLoadStale(loadGen)) return null;
      mergeWallet(data);
      done += 1;
      setLoadProgress(done, addresses.length, Object.keys(state.sourceErrors).length ? "warning" : "");
      applyPortfolioSnapshot(buildMergedSnapshot());
      setStatus(`Updating ${addresses.length} wallets… ${done}/${addresses.length}`);
      return data;
    });

    if (isPortfolioLoadStale(loadGen)) return;

    const failedWallets = results.filter((r) => r.status === "rejected");
    if (failedWallets.length) state.sourceErrors.wallets = `${failedWallets.length} wallet(s) unavailable`;

    const snapshot = buildMergedSnapshot();
    snapshot.sourceErrors = { ...state.sourceErrors };
    PortfolioCache.setPortfolio(cacheKey, snapshot);
    applyPortfolioSnapshot(snapshot);
    setStatus(
      failedWallets.length
        ? `Updated with gaps · ${failedWallets.length}/${addresses.length} wallet errors`
        : `Portfolio updated · ${formatCacheAge(snapshot.fetchedAt)}`,
      failedWallets.length ? "warning" : "",
    );
  } catch (e) {
    if (!isPortfolioLoadStale(loadGen)) {
      setStatus(cached ? `Update failed · showing cached data (${formatCacheAge(cached.fetchedAt)})` : "Error loading wallets: " + e.message, "negative");
    }
  } finally {
    if (!isPortfolioLoadStale(loadGen)) {
      clearLoadProgress();
      setBusy(false);
    }
  }
};

// Expose single-wallet trigger for auth.js fallback
window.triggerLoad = async function(address) {
  try {
    const wallet = await resolveWallet(address);
    await loadPortfolio(wallet.address, wallet.ens);
  } catch (e) {
    setStatus(e.message, "negative");
  }
};


// ─── RESET DASHBOARD (called on logout) ──────────────────────────────────────
window.resetDashboard = function() {
  bumpPortfolioLoadGen();
  clearComputeCaches();
  // Reset all KPI values to dashes
  const dashFields = [
    "heroNetWorth","heroNetWorthEth",
    "heroDailyIncome","heroDailyIncomePct","heroDailyIncomeEth",
    "heroYearlyIncome","heroYearlyIncomePct","heroYearlyIncomeEth",
    "dailyPnl","blendedApr","healthFactor",
    "walletLabel","ensLabel","updatedAt",
    "sparkNet","walletAssetsNet","aaveNet","uniswapAssets","uniswapNet","summaryTotal",
    "sparkSupplyMeta","sparkBorrowMeta","aaveSupplyMeta","aaveBorrowMeta",
  ];
  dashFields.forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = "—"; el.classList.remove("skeleton-text", "skeleton-text--hero"); el.dataset.value = ""; } });

  if (els.allocationModule) els.allocationModule.hidden = true;
  if (els.netWorthHistoryModule) els.netWorthHistoryModule.hidden = true;
  lastSnapshot = null;
  lastNativeAssets = null;

  // Clear tables
  const emptyMsg = (cols, msg) => `<tr><td class="empty" colspan="${cols}">${msg}</td></tr>`;
  if (els.walletAssetRows) els.walletAssetRows.innerHTML = emptyMsg(5, "Load a wallet to see balances.");
  if (els.sparkSupplyRows) els.sparkSupplyRows.innerHTML = emptyMsg(5, "Load a wallet to fetch live Spark collateral.");
  if (els.sparkBorrowRows) els.sparkBorrowRows.innerHTML = emptyMsg(5, "Load a wallet to fetch live Spark debt.");
  if (els.aaveSupplyRows)  els.aaveSupplyRows.innerHTML  = emptyMsg(6, "Load a wallet to fetch live Aave collateral.");
  if (els.aaveBorrowRows)  els.aaveBorrowRows.innerHTML  = emptyMsg(6, "Load a wallet to fetch live Aave debt.");
  if (els.uniswapPositions) els.uniswapPositions.innerHTML = `<div class="empty">Load a wallet to fetch live Uniswap V3 positions.</div>`;
  if (els.pnlBars) els.pnlBars.innerHTML = "";

  // Remove HF gauge
  const kpiEl = els.healthFactor?.closest(".kpi");
  if (kpiEl) { const g = kpiEl.querySelector(".hf-gauge"); if (g) g.remove(); }

  // Clear status
  if (els.statusLine) { els.statusLine.textContent = "Enter a wallet address or sign in."; els.statusLine.className = "status-line"; }
  if (els.introStatus) { els.introStatus.textContent = ""; els.introStatus.className = "intro-status"; }

  // Reset state
  state.address = "";
  state.ens = "";
  clearLoadProgress();
  setBusy(false);
};

// ─── CLIENT MODE: update banner + growth chart after data loads ──────────────
function renderTotals(data) {
  renderTotalsCore(data);
  if (!window._clientProfile) return;

  // Update client banner stats
  const fmtU = v => Number.isFinite(v) ? v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}) : "—";
  const fmtP = v => Number.isFinite(v) ? v.toFixed(2)+"%" : "—";

  const statBal  = document.getElementById("clientStatBalance");
  const statYld  = document.getElementById("clientStatYield");
  const statApr  = document.getElementById("clientStatApr");

  if (statBal) statBal.textContent = fmtU(data.netWorth);
  if (statApr) statApr.textContent = fmtP(data.blendedApr);

  const yearlyUsd = Number.isFinite(data.netWorth) && Number.isFinite(data.blendedApr)
    ? data.netWorth * data.blendedApr / 100 : 0;
  if (statYld) {
    statYld.textContent = fmtU(yearlyUsd);
    statYld.className = yearlyUsd >= 0 ? "positive" : "negative";
  }

  // Render growth chart if enabled and APR is meaningful
  const profile = window._clientProfile;
  const years   = profile?.chart_years || 30;
  const apr     = data.blendedApr || 0;
  const balance = data.netWorth   || 0;
  const growthModule = document.getElementById("growthChartModule");
  const shouldShowGrowth = (profile?.show_growth_chart ?? 1) && balance > 0 && apr > 0;
  if (growthModule) growthModule.hidden = !shouldShowGrowth;
  if (shouldShowGrowth) {
    renderGrowthChart(balance, apr, years);
  }
}

function renderGrowthChart(principal, aprPct, years) {
  const canvas = document.getElementById("growthChartCanvas");
  if (!canvas) return;
  const card = document.getElementById("growthChartModule");
  if (!card) return;

  const apr = aprPct / 100;
  const pts = years + 1;
  const values    = Array.from({length: pts}, (_, y) => principal * Math.pow(1 + apr, y));
  const labels    = Array.from({length: pts}, (_, y) => y === 0 ? "Now" : `Y${y}`);

  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#1de9c6";
  const fmtValue = (v) => {
    if (!Number.isFinite(v)) return "—";
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${Math.round(v).toLocaleString()}`;
  };

  let tooltip = card.querySelector(".growth-chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "growth-chart-tooltip";
    tooltip.hidden = true;
    card.appendChild(tooltip);
  }

  const drawChart = (hoverIndex = null) => {
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth || 800;
    const H   = 280;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padL = 72, padR = 24, padT = 24, padB = 30;
    const cW = W - padL - padR, cH = H - padT - padB;
    const maxV = Math.max(...values);
    const scX = i => padL + (i / (pts - 1)) * cW;
    const scY = v => padT + cH - (v / maxV * cH);

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * cH;
      ctx.strokeStyle = "rgba(26,46,43,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      const v = maxV * (1 - i / 4);
      ctx.fillStyle = "rgba(107,136,130,0.65)";
      ctx.font = "10px 'Space Grotesk', sans-serif";
      ctx.textAlign = "right";
      const label = v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v)}`;
      ctx.fillText(label, padL - 6, y + 3);
    }

    // Principal line (dashed flat)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(26,46,43,1)";
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.moveTo(scX(0), scY(principal)); ctx.lineTo(scX(pts - 1), scY(principal));
    ctx.stroke(); ctx.setLineDash([]);

    // Fill
    ctx.beginPath();
    values.forEach((v, i) => i === 0 ? ctx.moveTo(scX(i), scY(v)) : ctx.lineTo(scX(i), scY(v)));
    ctx.lineTo(scX(pts - 1), padT + cH); ctx.lineTo(scX(0), padT + cH); ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, H);
    grad.addColorStop(0, primary + "2a"); grad.addColorStop(1, primary + "00");
    ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = primary; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    values.forEach((v, i) => i === 0 ? ctx.moveTo(scX(i), scY(v)) : ctx.lineTo(scX(i), scY(v)));
    ctx.stroke();

    // X labels every 5 years
    ctx.fillStyle = "rgba(107,136,130,0.7)";
    ctx.font = "10px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    labels.forEach((l, i) => { if (i % 5 === 0) ctx.fillText(l, scX(i), H - 6); });

    // End dot + label
    const lx = scX(pts - 1), ly = scY(values[pts - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = primary; ctx.fill();
    const finalFmt = values[pts - 1] >= 1e6
      ? `$${(values[pts - 1] / 1e6).toFixed(1)}M`
      : `$${Math.round(values[pts - 1]).toLocaleString()}`;
    ctx.fillStyle = primary;
    ctx.font = "bold 11px 'Space Grotesk', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(finalFmt, lx + 2, ly - 12);

    if (Number.isInteger(hoverIndex) && hoverIndex >= 0 && hoverIndex < pts) {
      const hx = scX(hoverIndex);
      const hy = scY(values[hoverIndex]);
      ctx.strokeStyle = "rgba(107,136,130,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + cH);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = primary;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(9,15,14,1)";
      ctx.stroke();
    }

    canvas._growthChartGeometry = { padL, padR, padT, padB, cW, cH, W, H, pts, scX };
  };

  drawChart();

  const updateHover = (clientX) => {
    const geo = canvas._growthChartGeometry;
    if (!geo) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const clamped = Math.min(Math.max(x, geo.padL), geo.W - geo.padR);
    const ratio = geo.cW > 0 ? (clamped - geo.padL) / geo.cW : 0;
    const idx = Math.round(ratio * (geo.pts - 1));
    const safeIndex = Math.min(Math.max(idx, 0), geo.pts - 1);

    drawChart(safeIndex);
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${labels[safeIndex]}</strong><span>${fmtValue(values[safeIndex])}</span>`;
    const tooltipLeft = Math.min(Math.max(geo.scX(safeIndex) - 60, 12), geo.W - 132);
    tooltip.style.left = `${tooltipLeft}px`;
    tooltip.style.top = "64px";
  };

  canvas.onmousemove = (event) => updateHover(event.clientX);
  canvas.onmouseleave = () => {
    drawChart();
    tooltip.hidden = true;
  };
  canvas.ontouchmove = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    updateHover(touch.clientX);
  };
  canvas.ontouchend = () => {
    drawChart();
    tooltip.hidden = true;
  };

  const titleEl = document.getElementById("growthChartTitle");
  if (titleEl) titleEl.textContent = `Portfolio in ${years} Years at ${aprPct.toFixed(1)}% APR`;
}

// ─── CLIENT PREVIEW: sample dashboard (no on-chain / API calls) ───────────────
window.renderClientPreview = function(profile) {
  revealDashboard();
  state.ethUsd = 3200;
  state.address = "0x000000000000000000000000000000000000dead";
  state.ens = "";
  state.timestamps = { price: new Date(), market: new Date(), wallet: new Date() };
  state.sourceErrors = {};

  const showAssets = (profile?.show_assets ?? 1) !== 0;
  const showLending = (profile?.show_lending ?? 1) !== 0;
  const showLiquidity = (profile?.show_liquidity ?? 1) !== 0;

  const nativeAssets = {
    balances: showAssets ? [
      { network: "Ethereum", symbol: "ETH", balance: 12.5, priceUsd: 3200, valueUsd: 40000 },
      { network: "Ethereum", symbol: "USDC", balance: 25000, priceUsd: 1, valueUsd: 25000 },
    ] : [],
    assetsUsd: showAssets ? 65000 : 0,
    failedNetworks: [],
  };

  const sparkSupplies = showLending ? [
    { symbol: "wstETH", balance: 8.2, valueUsd: 30500, supplyApy: 3.2, daily: 2.68, note: "" },
  ] : [];
  const sparkBorrows = showLending ? [
    { symbol: "USDC", balance: 12000, valueUsd: 12000, borrowApr: 5.1, daily: 1.68 },
  ] : [];
  const spark = {
    supplies: sparkSupplies,
    borrows: sparkBorrows,
    assetsUsd: sparkSupplies.reduce((s, r) => s + r.valueUsd, 0),
    debtUsd: sparkBorrows.reduce((s, r) => s + r.valueUsd, 0),
    daily: 1.0,
    supplyDaily: 2.68,
    borrowDaily: 1.68,
    healthFactor: 2.45,
  };

  const aave = { supplies: [], borrows: [], assetsUsd: 0, debtUsd: 0, daily: 0, supplyDaily: 0, borrowDaily: 0, healthFactor: NaN };

  const uniPositions = showLiquidity ? [{
    pair: "ETH / USDC",
    network: "Ethereum",
    tokenId: "12345",
    feeTier: 0.3,
    inRange: true,
    valueUsd: 48500,
    unclaimedFeesUsd: 124,
    feeApr: 18.5,
    daily: 24.6,
    tick: -201840,
    tickLower: -203000,
    tickUpper: -200500,
    volume7dUsd: 1250000,
    poolDailyFeesUsd: 890,
    liquidityShare: 0.0012,
    ilNote: "-0.3%",
    source: "Preview",
  }] : [];
  const uniswap = {
    positions: uniPositions,
    assetsUsd: uniPositions.reduce((s, p) => s + p.valueUsd, 0),
    daily: uniPositions.reduce((s, p) => s + p.daily, 0),
  };

  const totalAssets = nativeAssets.assetsUsd + spark.assetsUsd + aave.assetsUsd + uniswap.assetsUsd;
  const totalDebt = spark.debtUsd + aave.debtUsd;
  const netWorth = totalAssets - totalDebt;
  const netDaily = spark.daily + aave.daily + uniswap.daily;
  const blendedApr = netWorth > 0 ? (netDaily * 365 * 100) / netWorth : 8.5;

  if ((profile?.show_wallet_numbers ?? 1) !== 0) {
    els.walletLabel.textContent = "0x0000…dead";
    els.ensLabel.textContent = "Preview";
  }
  if (els.statusLine) {
    els.statusLine.textContent = "Preview mode — sample data, not live balances.";
    els.statusLine.className = "status-line";
  }

  renderWalletAssets(nativeAssets);
  renderSpark(spark);
  renderAave(aave);
  renderUniswap(uniswap);
  renderDefiEmptyState(nativeAssets, spark, aave, uniswap);
  const totals = {
    totalAssets,
    totalDebt,
    netWorth,
    netDaily,
    blendedApr,
    healthFactor: spark.healthFactor,
    contributions: [
      { label: "Spark supply", value: spark.supplyDaily },
      { label: "Spark debt", value: -spark.borrowDaily },
      { label: "Uniswap LP fees", value: uniswap.daily },
    ].filter((c) => c.value !== 0),
  };
  renderTotals(totals);
  renderPortfolioViz({
    nativeAssets,
    spark,
    aave,
    uniswap,
    renderData: totals,
    fetchedAt: Date.now(),
  });
  if ((profile?.show_risk ?? 1) === 0) {
    const hfKpi = els.healthFactor?.closest(".kpi");
    if (hfKpi) { const g = hfKpi.querySelector(".hf-gauge"); if (g) g.remove(); }
  }
  renderTimestamps();
};


function initWalletDeepLink() {
  ensureHoldingsFilterUI();
  els.hideDustToggle?.addEventListener("change", () => {
    if (lastNativeAssets) renderWalletAssets(lastNativeAssets);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (lastSnapshot) renderPortfolioViz(lastSnapshot);
    }, 150);
  });

  const params = new URLSearchParams(location.search);
  const wallet = (params.get("wallet") || params.get("address") || "").trim();
  if (!wallet) return;

  if (els.walletInput) els.walletInput.value = wallet;
  if (els.introWalletInput) els.introWalletInput.value = wallet;

  history.replaceState({}, "", `${location.pathname}${location.hash}`);

  loadReadOnlyWallet(wallet).catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWalletDeepLink);
} else {
  initWalletDeepLink();
}
