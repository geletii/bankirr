import SwiftUI

private let notchBlack = Color.black

struct NotchIslandRootView: View {
    private enum InsightCategory: String, CaseIterable, Identifiable {
        case assets = "Total"
        case lending = "Lending"
        case pools = "Pools"

        var id: String { rawValue }
    }

    private enum EarningsPeriod: String, CaseIterable, Identifiable {
        case daily = "Daily"
        case monthly = "Monthly"
        case yearly = "Yearly"

        var id: String { rawValue }
    }

    private struct Metric: Identifiable {
        let id = UUID()
        let title: String
        let value: String
        let color: Color
    }

    @EnvironmentObject private var controller: NotchIslandController
    @EnvironmentObject private var store: WalletStore
    @EnvironmentObject private var updater: UpdateManager
    @EnvironmentObject private var coordinator: DisplaySurfaceCoordinator
    @State private var selectedCategory: InsightCategory = .assets
    @State private var selectedEarningsPeriod: EarningsPeriod = .daily
    @State private var statsWalletFilter: UUID?
    @State private var showAddWallet = false
    @State private var newWalletAddress = ""
    @State private var newWalletName = ""

    private var metrics: NotchMetrics {
        if let screen = NotchScreenGeometry.notchScreen {
            return NotchMetrics.current(on: screen)
        }
        return NotchMetrics.current(on: NSScreen.main ?? NSScreen.screens.first!)
    }

    private var isExpanded: Bool { controller.phase == .expanded }
    private var isDormant: Bool { controller.phase == .dormant }

    private var islandWidth: CGFloat {
        switch controller.phase {
        case .dormant:
            let rightHint = coordinator.isNotchHintIconVisible ? NotchScreenGeometry.hoverHintWidth : 0
            return metrics.notchWidth + NotchScreenGeometry.hoverHintWidth + rightHint
        case .compact: return metrics.notchWidth
        case .expanded: return max(NotchScreenGeometry.expandedPanelWidth, metrics.notchWidth)
        }
    }

    private var islandHeight: CGFloat {
        switch controller.phase {
        case .dormant: return metrics.notchHeight
        case .compact: return metrics.notchHeight + NotchScreenGeometry.compactDrop
        case .expanded: return metrics.notchHeight + NotchScreenGeometry.expandedContentHeight
        }
    }

    private var bottomCornerRadius: CGFloat {
        isExpanded ? 24 : 14
    }

    private var compactShadowRadius: CGFloat { 3 }
    private var compactShadowY: CGFloat { 1 }

    var body: some View {
        ZStack(alignment: .top) {
            ZStack(alignment: .top) {
                if !isDormant {
                    NotchIslandWrapShape(bottomCornerRadius: bottomCornerRadius)
                        .fill(notchBlack)
                        .shadow(
                            color: .black.opacity(isExpanded ? 0.35 : 0.1),
                            radius: isExpanded ? 22 : compactShadowRadius,
                            y: isExpanded ? 6 : compactShadowY
                        )
                        .frame(width: islandWidth, height: islandHeight)
                }

                content
                    .frame(width: islandWidth, height: islandHeight)
            }
            .animation(.spring(response: 0.36, dampingFraction: 0.86), value: controller.phase)

            if !isExpanded {
                if coordinator.isNotchHintIconVisible {
                    bitcoinHintOverlay
                }
                openDetailsTapLayer
                if controller.phase == .compact {
                    compactControlsOverlay
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onHover { controller.handleHover($0) }
        .preferredColorScheme(.dark)
    }

    private var openDetailsTapLayer: some View {
        Color.clear
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture {
                openDetails(source: "area")
            }
            .contextMenu {
                NotchSettingsMenuItems(coordinator: coordinator)
            }
    }

    @ViewBuilder
    private var content: some View {
        switch controller.phase {
        case .dormant:
            dormantContent
        case .compact:
            VStack(spacing: 0) {
                Color.clear.frame(height: metrics.notchHeight)
                compactContent
            }
        case .expanded:
            ZStack(alignment: .top) {
                VStack(spacing: 0) {
                    Color.clear.frame(height: metrics.notchHeight)
                    expandedContent
                }

                HStack {
                    expandedDashboardButton
                        .padding(.leading, 12)
                    Spacer(minLength: 0)
                    expandedSettingsButton
                        .padding(.trailing, 12)
                }
                .padding(.top, max((metrics.notchHeight - 28) / 2, 4))
            }
            .contextMenu {
                NotchSettingsMenuItems(coordinator: coordinator)
            }
        }
    }

    // MARK: - Dormant (hidden, native hover hint to the right of the notch)

    private var dormantContent: some View {
        Color.clear
            .frame(maxHeight: .infinity)
    }

    private var bitcoinHintOverlay: some View {
        HStack(spacing: 0) {
            Color.clear
                .frame(width: metrics.notchWidth + NotchScreenGeometry.hoverHintWidth)
            bitcoinHintIcon
                .frame(
                    width: NotchScreenGeometry.hoverHintWidth,
                    height: metrics.notchHeight
                )
        }
        .frame(
            width: metrics.notchWidth + NotchScreenGeometry.hoverHintWidth * 2,
            height: metrics.notchHeight
        )
        .frame(maxWidth: .infinity, alignment: .top)
    }

    private var bitcoinHintIcon: some View {
        Image(systemName: "bitcoinsign")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white.opacity(0.9))
            .shadow(color: .black.opacity(0.35), radius: 2)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Compact (revealed on hover / pinned)

    private var compactContent: some View {
        HStack(spacing: 7) {
            amountLabel
            Color.clear.frame(width: 16, height: 16)
            Spacer(minLength: 4)
            Color.clear.frame(width: 8, height: 8)
        }
        .padding(.leading, 13)
        .padding(.trailing, 11)
        .frame(maxHeight: .infinity)
        .frame(height: NotchScreenGeometry.compactDrop)
    }

    private var compactControlsOverlay: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: metrics.notchHeight)
            HStack(spacing: 7) {
                amountLabel.hidden()
                pinButton
                Spacer(minLength: 4)
                statusDot
            }
            .padding(.leading, 13)
            .padding(.trailing, 11)
            .frame(height: NotchScreenGeometry.compactDrop)
        }
        .frame(width: islandWidth, height: islandHeight)
    }

    private var amountLabel: some View {
        Group {
            if store.isPortfolioLoading {
                ProgressView()
                    .controlSize(.small)
                    .tint(.white)
                    .frame(width: 16, height: 16)
            } else if store.shouldShowStatusAmount {
                Text(store.statusBarTitle)
                    .font(.system(size: 13, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                    .contentTransition(.numericText())
            } else {
                Image(systemName: "bitcoinsign")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
    }

    private var pinButton: some View {
        Button {
            controller.togglePin()
        } label: {
            Image(systemName: controller.isPinned ? "pin.fill" : "pin")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(controller.isPinned ? Color(red: 0.36, green: 0.91, blue: 0.47) : .white.opacity(0.55))
                .frame(width: 16, height: 16)
        }
        .buttonStyle(.plain)
        .bankirrHelp(controller.isPinned ? "Unpin price" : "Pin price to keep it visible")
    }

    private var statusDot: some View {
        Circle()
            .fill(notchRiskColor(store.totals.statusBarRiskColor))
            .frame(width: 8, height: 8)
            .shadow(color: notchRiskColor(store.totals.statusBarRiskColor).opacity(0.7), radius: 4)
            .bankirrHelp(RiskTooltipFormatting.liquidationRisk(for: store.totals))
            .contentShape(Circle())
    }

    // MARK: - Expanded

    private var expandedContent: some View {
        VStack(spacing: 10) {
            marketTickerBar
            refreshStatusBar

            HStack(spacing: 8) {
                ForEach(InsightCategory.allCases) { category in
                    categoryButton(category)
                }
            }

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    if selectedCategory == .assets {
                        categoryCard
                        walletsSection
                    } else {
                        categoryCard
                    }
                }
                .padding(.bottom, 4)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task {
            await store.refreshNetworkConditions()
        }
        .onChange(of: store.wallets.map(\.id)) { walletIDs in
            if let id = statsWalletFilter, !walletIDs.contains(id) {
                statsWalletFilter = nil
            }
        }
    }

    private var marketTickerBar: some View {
        HStack(spacing: 0) {
            marketTickerItem(
                icon: "circle.hexagonpath.fill",
                label: "ETH",
                value: store.marketEthUsd > 0
                    ? CurrencyFormatting.compactUsd(store.marketEthUsd)
                    : "—"
            )
            Spacer(minLength: 8)
            marketTickerItem(
                icon: "fuelpump.fill",
                label: "Transfer",
                value: transferGasLabel
            )
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                )
        )
    }

    private var transferGasLabel: String {
        guard let gwei = store.marketGasGwei else { return "—" }
        let gweiText = CurrencyFormatting.gwei(gwei)
        if let usd = store.marketTransferGasUsd, usd > 0 {
            return "\(gweiText) · \(CurrencyFormatting.transferGasUsd(usd))"
        }
        return gweiText
    }

    private var refreshStatusBar: some View {
        HStack(spacing: 8) {
            Group {
                if store.isPortfolioLoading {
                    HStack(spacing: 5) {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white.opacity(0.6))
                        Text("Updating…")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                } else if let refreshed = store.lastRefreshedAt {
                    HStack(spacing: 5) {
                        Image(systemName: "clock")
                            .font(.system(size: 9, weight: .semibold))
                        Text("Updated \(refreshed.formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(.white.opacity(0.55))
                }
            }

            Spacer(minLength: 0)

            RefreshIconButton(
                isRefreshing: store.isRefreshing,
                iconColor: .white.opacity(0.75),
                backgroundColor: .white.opacity(0.08)
            ) {
                Task { await store.refreshAllWallets(manual: true) }
            }
        }
    }

    private func marketTickerItem(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.45))
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.45))
            Text(value)
                .font(.system(size: 11, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white.opacity(0.78))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    private var walletFilterMenu: some View {
        Menu {
            Button {
                statsWalletFilter = nil
            } label: {
                if statsWalletFilter == nil {
                    Label("All wallets", systemImage: "checkmark")
                } else {
                    Text("All wallets")
                }
            }

            if !store.rows.isEmpty {
                Divider()
                ForEach(store.rows) { wallet in
                    Button {
                        statsWalletFilter = wallet.id
                    } label: {
                        if statsWalletFilter == wallet.id {
                            Label(wallet.displayName, systemImage: "checkmark")
                        } else {
                            Text(wallet.displayName)
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(statsWalletFilterLabel)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.45))
            }
            .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize(horizontal: false, vertical: true)
        .bankirrHelp("Show stats for a specific wallet or all wallets combined")
    }

    private var statsWalletFilterLabel: String {
        guard let id = statsWalletFilter,
              let wallet = store.wallets.first(where: { $0.id == id }) else {
            return "All wallets"
        }
        let hasCustomName = wallet.name?.isEmpty == false
        return hasCustomName ? wallet.name! : WalletFormatting.shortAddress(wallet.address)
    }

    private var categoryDisplayTotals: PortfolioTotals {
        guard selectedCategory != .assets else { return store.totals }
        guard let id = statsWalletFilter, let snapshot = store.snapshots[id] else {
            return store.totals
        }
        return PortfolioTotals(snapshot: snapshot)
    }

    private var isCategoryStatsLoading: Bool {
        guard selectedCategory != .assets else { return store.isPortfolioLoading }
        if let id = statsWalletFilter {
            return store.loadingStates[id] != nil || store.snapshots[id] == nil
        }
        return store.isPortfolioLoading
    }

    private var walletsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Wallets")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.9))
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { showAddWallet.toggle() }
                } label: {
                    Image(systemName: showAddWallet ? "xmark" : "plus")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.85))
                        .frame(width: 24, height: 24)
                        .background(.white.opacity(0.1), in: Circle())
                }
                .buttonStyle(.plain)
                .bankirrHelp(showAddWallet ? "Cancel" : "Add wallet")
            }

            if showAddWallet {
                addWalletForm
            }

            VStack(spacing: 8) {
                ForEach(store.rows) { wallet in
                    walletRow(wallet)
                }
            }
        }
    }

    private var addWalletForm: some View {
        VStack(spacing: 7) {
            TextField("Address or ENS", text: $newWalletAddress)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 13))
            HStack(spacing: 8) {
                TextField("Name (optional)", text: $newWalletName)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))
                Button("Add") {
                    let address = newWalletAddress.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !address.isEmpty else { return }
                    let name = newWalletName.trimmingCharacters(in: .whitespacesAndNewlines)
                    store.addWallet(name: name.isEmpty ? nil : name, address: address)
                    newWalletAddress = ""
                    newWalletName = ""
                    withAnimation(.easeInOut(duration: 0.18)) { showAddWallet = false }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(newWalletAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.05))
        )
    }

    private var expandedDashboardButton: some View {
        Button {
            guard let url = BankirrConfig.dashboardURL else { return }
            NSWorkspace.shared.open(url)
        } label: {
            Image(systemName: "arrow.up.right.square")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.75))
                .frame(width: 28, height: 28)
                .background(.white.opacity(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .bankirrHelp("Open dashboard")
    }

    private var expandedSettingsButton: some View {
        Menu {
            NotchSettingsMenuItems(coordinator: coordinator)
        } label: {
            Image(systemName: "gearshape")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.75))
                .frame(width: 28, height: 28)
                .background(.white.opacity(0.08), in: Circle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .bankirrHelp("Settings")
    }

    private func categoryButton(_ category: InsightCategory) -> some View {
        let selected = selectedCategory == category
        return Button {
            selectedCategory = category
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon(for: category))
                    .font(.system(size: 12, weight: .semibold))
                Text(category.rawValue)
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(selected ? .white : .white.opacity(0.85))
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(selected ? Color.white.opacity(0.22) : Color.white.opacity(0.07))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(Color.white.opacity(selected ? 0.28 : 0.14), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var categoryCard: some View {
        let metrics = categoryMetrics
        let loading = isCategoryStatsLoading
        return VStack(alignment: .leading, spacing: 12) {
            if let hero = metrics.first {
                VStack(alignment: .leading, spacing: 3) {
                    Text(hero.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.65))
                    if loading {
                        Text("…")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(.white.opacity(0.45))
                    } else {
                        Text(hero.value)
                            .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                            .foregroundStyle(hero.color)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    }
                }
            }

            if metrics.count > 1 {
                VStack(spacing: 9) {
                    ForEach(metrics.dropFirst()) { metric in
                        HStack {
                            Text(metric.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.7))
                            Spacer()
                            if loading {
                                Text("…")
                                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.white.opacity(0.45))
                            } else {
                                Text(metric.value)
                                    .font(.system(size: 16, weight: .semibold, design: .rounded).monospacedDigit())
                                    .foregroundStyle(metric.color)
                            }
                        }

                        if selectedCategory == .assets && metric.title == "Holdings" {
                            earningsRow(totals: categoryDisplayTotals, loading: loading)
                        }
                    }
                }
            }

            if selectedCategory != .assets {
                Divider()
                    .overlay(Color.white.opacity(0.12))

                HStack {
                    Text("Filter")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer()
                    walletFilterMenu
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.07))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
        )
    }

    private func walletRow(_ wallet: WalletRowViewModel) -> some View {
        HStack(spacing: 8) {
            Button {
                openInDashboard(wallet.address)
            } label: {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            if wallet.hasCustomName {
                                Text(wallet.displayName)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.45))
                            } else {
                                WalletAddressCopyLine(
                                    address: wallet.address,
                                    font: .system(size: 15, weight: .semibold),
                                    foreground: .white
                                )
                            }
                        }
                        if wallet.hasCustomName {
                            WalletAddressCopyLine(
                                address: wallet.address,
                                foreground: .white.opacity(0.5)
                            )
                        }
                    }
                    Spacer(minLength: 6)
                    walletAmount(wallet)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            WalletCopyButton(address: wallet.address, foreground: .white.opacity(0.45))

            Button {
                store.deleteWallet(id: wallet.id)
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: 26, height: 26)
                    .background(.white.opacity(0.08), in: Circle())
            }
            .buttonStyle(.plain)
            .bankirrHelp("Remove wallet")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.white.opacity(0.1), lineWidth: 1)
                )
        )
    }

    private func openInDashboard(_ address: String) {
        if let url = BankirrLinks.dashboardURL(for: address) {
            NSWorkspace.shared.open(url)
        } else if let url = BankirrConfig.dashboardURL {
            NSWorkspace.shared.open(url)
        }
    }

    @ViewBuilder
    private func walletAmount(_ wallet: WalletRowViewModel) -> some View {
        switch wallet.state {
        case .loaded(let snapshot):
            Text(CurrencyFormatting.compactUsd(snapshot.netWorth))
                .font(.system(size: 17, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white.opacity(0.92))
        case .loading:
            ProgressView()
                .controlSize(.small)
                .tint(.white.opacity(0.6))
                .frame(width: 20, height: 20)
        case .idle:
            Text("…")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.5))
        case .failed:
            Text("Error")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.orange)
        }
    }

    private var categoryMetrics: [Metric] {
        let totals = categoryDisplayTotals
        let red = Color.red.opacity(0.95)

        switch selectedCategory {
        case .assets:
            return [
                Metric(title: "Net worth", value: CurrencyFormatting.fullCurrency(totals.netWorth), color: .white),
                Metric(
                    title: "Holdings",
                    value: CurrencyFormatting.fullCurrency(totals.assets),
                    color: .white.opacity(0.92)
                )
            ]
        case .lending:
            let atRisk = (totals.healthFactor ?? .infinity) < 1.5
            return [
                Metric(title: "Lending", value: CurrencyFormatting.fullCurrency(totals.lending), color: .white),
                Metric(
                    title: "Debt",
                    value: CurrencyFormatting.fullCurrency(-totals.debt),
                    color: totals.debt > 0 ? red : .white
                ),
                Metric(
                    title: "Health factor",
                    value: MetricFormatting.healthFactor(totals.healthFactor),
                    color: atRisk ? .orange : .white
                ),
                Metric(
                    title: "Liq. ETH price",
                    value: MetricFormatting.liquidationPrice(totals.liquidationEthPrice),
                    color: atRisk ? .orange : .white
                )
            ]
        case .pools:
            return [
                Metric(title: "Liquidity pools", value: CurrencyFormatting.fullCurrency(totals.liquidityPools), color: .white)
            ]
        }
    }

    private var earningsPeriodLabel: String {
        switch selectedEarningsPeriod {
        case .daily: return "Earnings / day"
        case .monthly: return "Earnings / month"
        case .yearly: return "Earnings / year"
        }
    }

    private func cycleEarningsPeriod() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
            switch selectedEarningsPeriod {
            case .daily: selectedEarningsPeriod = .monthly
            case .monthly: selectedEarningsPeriod = .yearly
            case .yearly: selectedEarningsPeriod = .daily
            }
        }
    }

    private func earningsRow(totals: PortfolioTotals, loading: Bool) -> some View {
        let data = earningsData(for: selectedEarningsPeriod, totals: totals)
        let positive = data.amount >= 0
        let accent = earningsAccent(positive: positive)

        return HStack {
            Text(earningsPeriodLabel)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
                .animation(.easeInOut(duration: 0.18), value: selectedEarningsPeriod)

            Spacer()

            if loading {
                Text("…")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.45))
            } else {
                Button(action: cycleEarningsPeriod) {
                    HStack(spacing: 8) {
                        Text(CurrencyFormatting.signedCompactUsd(data.amount))
                            .font(.system(size: 16, weight: .semibold, design: .rounded).monospacedDigit())
                            .foregroundStyle(accent)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .contentTransition(.numericText())

                        if let percent = data.percent {
                            Text(MetricFormatting.signedPercent(percent))
                                .font(.system(size: 11, weight: .semibold, design: .rounded).monospacedDigit())
                                .foregroundStyle(accent.opacity(0.82))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule(style: .continuous)
                                        .fill(.white.opacity(0.08))
                                        .overlay(
                                            Capsule(style: .continuous)
                                                .stroke(.white.opacity(0.14), lineWidth: 0.5)
                                        )
                                )
                                .contentTransition(.numericText())
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .bankirrHelp("Tap to switch between daily, monthly, and yearly")
            }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: selectedEarningsPeriod)
    }

    private struct EarningsPeriodData {
        let amount: Double
        let percent: Double?
    }

    private func earningsData(for period: EarningsPeriod, totals: PortfolioTotals) -> EarningsPeriodData {
        switch period {
        case .daily:
            return EarningsPeriodData(amount: totals.netDaily, percent: totals.dailyReturnPercent)
        case .monthly:
            return EarningsPeriodData(amount: totals.netMonthly, percent: totals.monthlyReturnPercent)
        case .yearly:
            return EarningsPeriodData(amount: totals.netYearly, percent: totals.yearlyReturnPercent)
        }
    }

    private func earningsAccent(positive: Bool) -> Color {
        positive
            ? Color(red: 0.58, green: 0.74, blue: 0.62)
            : Color(red: 0.86, green: 0.42, blue: 0.40)
    }

    private func icon(for category: InsightCategory) -> String {
        switch category {
        case .assets: return "banknote"
        case .lending: return "building.columns"
        case .pools: return "drop"
        }
    }

    private func openDetails(source: String = "unknown") {
        guard controller.phase != .expanded else { return }
        controller.handleHover(true)
        controller.expand()
    }

    private func notchRiskColor(_ risk: StatusBarRiskColor) -> Color {
        switch risk {
        case .neutral, .safe:
            return Color(red: 0.22, green: 0.95, blue: 0.42)
        case .warning:
            return Color(red: 1.0, green: 0.62, blue: 0.22)
        }
    }
}

private struct NotchSettingsMenuItems: View {
    @ObservedObject var coordinator: DisplaySurfaceCoordinator

    var body: some View {
        if coordinator.surface == .notch {
            if coordinator.isNotchHintIconVisible {
                Button {
                    coordinator.hideNotchHintIcon()
                } label: {
                    Label("Hide icon", systemImage: "eye.slash")
                }
            } else {
                Button {
                    coordinator.showNotchHintIcon()
                } label: {
                    Label("Show icon", systemImage: "eye")
                }
            }

            if coordinator.canSwitchSurface {
                Divider()
            }
        }

        if coordinator.canSwitchSurface {
            Button {
                coordinator.moveToMenuBar()
            } label: {
                Label("Move to menu bar", systemImage: "menubar.rectangle")
            }
            .disabled(coordinator.isTransitioning)

            Divider()
        }

        Button("Quit Bankirr") {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q", modifiers: .command)
    }
}
