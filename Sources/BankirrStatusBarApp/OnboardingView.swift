import AppKit
import SwiftUI

/// LSUIElement menu bar apps use windows that cannot become key by default — text fields need this.
private final class KeyableWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

private enum BankirrAppIcon {
    static func load() -> NSImage? {
        for bundle in [Bundle.main, Bundle.module] {
            for ext in ["icns", "png"] {
                guard let url = bundle.url(forResource: "AppIcon", withExtension: ext),
                      let image = NSImage(contentsOf: url) else { continue }
                return image
            }
        }
        return NSApp.applicationIconImage
    }
}

// MARK: - Window manager

@MainActor
final class OnboardingWindowManager: NSObject, NSWindowDelegate {
    static let shared = OnboardingWindowManager()
    private var window: NSWindow?
    private var onComplete: (() -> Void)?

    func present(
        store: WalletStore,
        coordinator: DisplaySurfaceCoordinator,
        onComplete: @escaping () -> Void
    ) {
        self.onComplete = onComplete

        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let onboardingView = InitialOnboardingWindowView(
            store: store,
            coordinator: coordinator
        ) { [weak self] in
            self?.finish()
        }
        let host = NSHostingController(rootView: onboardingView)
        let window = KeyableWindow(contentViewController: host)
        window.title = "Bankirr"
        window.setContentSize(NSSize(width: 760, height: 600))
        window.minSize = NSSize(width: 680, height: 520)
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.center()
        window.delegate = self
        window.isReleasedWhenClosed = false
        if let icon = BankirrAppIcon.load() {
            NSApp.applicationIconImage = icon
        }
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
    }

    private func finish() {
        onComplete?()
        onComplete = nil
        close()
    }

    func close() {
        window?.close()
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.applicationIconImage = nil
        NSApp.setActivationPolicy(.accessory)
        if onComplete != nil {
            onComplete?()
            onComplete = nil
        }
        window = nil
    }
}

// MARK: - Main onboarding container

private enum OnboardingStep: Hashable {
    case welcome
    case menuBar
    case notch
    case risk
    case setup

    static func orderedSteps(canShowNotch: Bool) -> [OnboardingStep] {
        var steps: [OnboardingStep] = [.welcome, .menuBar]
        if canShowNotch { steps.append(.notch) }
        steps.append(contentsOf: [.risk, .setup])
        return steps
    }
}

struct InitialOnboardingWindowView: View {
    @ObservedObject var store: WalletStore
    @ObservedObject var coordinator: DisplaySurfaceCoordinator
    let onComplete: () -> Void

    @State private var page = 0
    @Environment(\.openURL) private var openURL

    private var steps: [OnboardingStep] {
        OnboardingStep.orderedSteps(canShowNotch: coordinator.canSwitchSurface)
    }

    private var isLastPage: Bool { page >= steps.count - 1 }
    private var currentStep: OnboardingStep { steps[page] }

    var body: some View {
        VStack(spacing: 0) {
            pageContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            bottomBar
                .padding(.horizontal, 36)
                .padding(.bottom, 28)
        }
        .frame(minWidth: 760, minHeight: 600)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    @ViewBuilder
    private var pageContent: some View {
        ZStack {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                if index == page {
                    stepView(for: step)
                        .id(step)
                        .transition(.asymmetric(
                            insertion: .move(edge: .trailing).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)
                        ))
                }
            }
        }
        .animation(.easeInOut(duration: 0.32), value: page)
        .padding(.horizontal, 36)
        .padding(.top, 32)
    }

    @ViewBuilder
    private func stepView(for step: OnboardingStep) -> some View {
        switch step {
        case .welcome:
            OnboardingWelcomePage()
        case .menuBar:
            OnboardingMenuBarPage()
        case .notch:
            OnboardingNotchPage()
        case .risk:
            OnboardingRiskPage()
        case .setup:
            OnboardingSetupPage(store: store, coordinator: coordinator, openURL: openURL)
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 18) {
            pageDots

            HStack {
                if page > 0 {
                    Button("Back") { page -= 1 }
                        .buttonStyle(.bordered)
                }

                Spacer()

                if !isLastPage {
                    Button("Skip") { onComplete() }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }

                Spacer().frame(width: 14)

                if isLastPage {
                    Button("Finish onboarding") { onComplete() }
                        .buttonStyle(.borderedProminent)
                        .disabled(!store.hasWallets)
                } else {
                    Button("Continue") { page += 1 }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.return, modifiers: [])
                }
            }
        }
    }

    private var pageDots: some View {
        HStack(spacing: 8) {
            ForEach(steps.indices, id: \.self) { index in
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) { page = index }
                } label: {
                    Circle()
                        .fill(index == page ? Color.accentColor : Color.secondary.opacity(0.28))
                        .frame(width: index == page ? 8 : 6, height: index == page ? 8 : 6)
                        .animation(.easeInOut(duration: 0.2), value: page)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Page \(index + 1) of \(steps.count)")
            }
        }
    }
}

// MARK: - Feature pages

private struct OnboardingWelcomePage: View {
    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 0)

            NetworkSphereIconView(radiusScale: 0.52)
                .frame(width: 280, height: 230)

            VStack(spacing: 10) {
                Text("Welcome to Bankirr")
                    .font(.system(size: 32, weight: .bold, design: .rounded))

                Text("Your DeFi portfolio, always one glance away.\nTrack net worth, lending risk, and daily changes from the menu bar or Dynamic Island on Mac.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct OnboardingMenuBarPage: View {
    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text("Live in the menu bar")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Text("Your total net worth stays visible while you work — updated in the background.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            OnboardingMenuBarDemoView()
                .frame(maxWidth: 520)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct OnboardingNotchPage: View {
    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text("Built for the notch")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Text("On MacBook with a notch, Bankirr lives right inside it — hover to peek, click to expand.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            OnboardingNotchDemoView()
                .frame(maxWidth: 420)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct OnboardingRiskPage: View {
    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text("Stay ahead of liquidation")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Text("Health factor and liquidation price are tracked across your wallets — color-coded when risk rises.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            OnboardingRiskDemoView()
                .frame(maxWidth: 400)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private enum OnboardingSetupField: Hashable {
    case walletName
    case walletAddress
}

private struct OnboardingSetupPage: View {
    @ObservedObject var store: WalletStore
    @ObservedObject var coordinator: DisplaySurfaceCoordinator
    let openURL: OpenURLAction
    @FocusState private var focusedField: OnboardingSetupField?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Set up Bankirr")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("Add your first wallet and choose where Bankirr should live on screen.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                SubscriptionCTABanner(store: store, openURL: openURL)
                AccountStatusStrip(store: store, openURL: openURL)

                OnboardingAddWalletSection(store: store, focusedField: $focusedField)

                if coordinator.canSwitchSurface {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Display location")
                            .font(.headline)
                        OnboardingDisplayChoice(coordinator: coordinator)
                    }
                }

                SupportContactLink()
                BetaVersionNotice()
            }
            .padding(.bottom, 8)
        }
        .onAppear {
            DispatchQueue.main.async {
                focusedField = .walletAddress
            }
        }
    }
}

private struct OnboardingAddWalletSection: View {
    @ObservedObject var store: WalletStore
    var focusedField: FocusState<OnboardingSetupField?>.Binding

    @State private var name = ""
    @State private var address = ""
    @State private var validationMessage: String?
    @State private var isSaving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Add wallet")
                .font(.headline)

            TextField("Wallet name (optional)", text: $name)
                .textFieldStyle(.roundedBorder)
                .focused(focusedField, equals: .walletName)

            TextField("Address / ENS", text: $address)
                .textFieldStyle(.roundedBorder)
                .focused(focusedField, equals: .walletAddress)

            if let validationMessage {
                Text(validationMessage)
                    .foregroundStyle(.red)
                    .font(.caption)
            }

            Button(isSaving ? "Saving…" : "Save wallet") {
                saveWallet()
            }
            .buttonStyle(.borderedProminent)
            .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
        }
        .padding(14)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
        .onChange(of: store.authMessage) { message in
            guard let message, !message.isEmpty, isSaving == false else { return }
            if validationMessage == nil {
                validationMessage = message
            }
        }
    }

    private func saveWallet() {
        let trimmedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAddress.isEmpty else {
            validationMessage = "Wallet address is required."
            return
        }
        if store.wallets.contains(where: { $0.address.caseInsensitiveCompare(trimmedAddress) == .orderedSame }) {
            validationMessage = "This wallet is already added."
            return
        }

        let optionalName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        isSaving = true
        validationMessage = nil
        Task {
            let success = await store.addWalletAsync(
                name: optionalName.isEmpty ? nil : optionalName,
                address: trimmedAddress
            )
            isSaving = false
            if success {
                validationMessage = nil
                name = ""
                address = ""
            } else {
                validationMessage = store.authMessage ?? "Could not add wallet."
            }
        }
    }
}

// MARK: - Setup helpers

private struct OnboardingDisplayChoice: View {
    @ObservedObject var coordinator: DisplaySurfaceCoordinator

    var body: some View {
        HStack(spacing: 12) {
            choiceCard(
                preference: .notch,
                icon: "macbook.gen2",
                title: "Notch",
                subtitle: "Dynamic Island style"
            )
            choiceCard(
                preference: .menuBar,
                icon: "menubar.rectangle",
                title: "Menu bar",
                subtitle: "Classic status item"
            )
        }
    }

    private func choiceCard(
        preference: DisplaySurfaceCoordinator.DisplayPreference,
        icon: String,
        title: String,
        subtitle: String
    ) -> some View {
        let selected = coordinator.displayPreference == preference
        return Button {
            coordinator.applyDisplayPreferenceFromSetup(preference)
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(selected ? Color.accentColor : .secondary)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(selected ? Color.accentColor.opacity(0.1) : Color.primary.opacity(0.04))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(selected ? Color.accentColor.opacity(0.5) : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Animated demos

private struct OnboardingMenuBarDemoView: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let phase = (sin(t * 0.7) + 1) / 2
            let amount = 118_400 + phase * 9_050

            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Spacer()
                    HStack(spacing: 6) {
                        Image(systemName: "bitcoinsign.circle.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.orange)
                        Text(CurrencyFormatting.compactUsd(amount))
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(.primary)
                            .contentTransition(.numericText())
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color(nsColor: .controlBackgroundColor))
                            .shadow(color: .black.opacity(0.12), radius: 4, y: 2)
                    )
                    .scaleEffect(1 + CGFloat(sin(t * 1.4)) * 0.015)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color(nsColor: .underPageBackgroundColor))

                demoPanel
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            )
        }
    }

    private var demoPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Net worth")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text("$127,453")
                .font(.system(size: 36, weight: .semibold, design: .rounded))
            HStack(spacing: 8) {
                Label("+$842/day", systemImage: "arrow.up.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.green.opacity(0.12), in: Capsule())
                Text("Updated just now")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

private struct OnboardingNotchDemoView: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let cycle = t.truncatingRemainder(dividingBy: 5)
            let expanded = cycle > 1.8 && cycle < 3.8
            let height: CGFloat = expanded ? 148 : 36
            let width: CGFloat = expanded ? 320 : 180

            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: expanded ? 22 : 18, style: .continuous)
                    .fill(.black)
                    .frame(width: width, height: height)
                    .overlay(alignment: .top) {
                        if expanded {
                            VStack(spacing: 10) {
                                Text("$127,453")
                                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.white)
                                HStack(spacing: 12) {
                                    notchMetric("Assets", "$98k", .white)
                                    notchMetric("Lending", "$41k", .green)
                                    notchMetric("Debt", "-$12k", .orange)
                                }
                            }
                            .padding(.top, 28)
                            .transition(.opacity.combined(with: .scale(scale: 0.95)))
                        } else {
                            HStack(spacing: 6) {
                                Circle().fill(.orange).frame(width: 8, height: 8)
                                Text("$127k")
                                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.white.opacity(0.9))
                            }
                            .padding(.top, 12)
                        }
                    }
                    .animation(.spring(response: 0.45, dampingFraction: 0.82), value: expanded)

                Spacer(minLength: 0)
            }
            .frame(height: 200)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [Color(nsColor: .underPageBackgroundColor), Color(nsColor: .windowBackgroundColor)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            )
        }
    }

    private func notchMetric(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
            Text(value)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(color)
        }
    }
}

private struct OnboardingRiskDemoView: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let cycle = t.truncatingRemainder(dividingBy: 6)
            let warning = cycle > 3.2
            let hf = warning ? 1.18 : 2.45
            let gaugeColor: Color = warning ? .orange : .green

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .stroke(Color.secondary.opacity(0.15), lineWidth: 10)
                    Circle()
                        .trim(from: 0, to: min(hf / 3.0, 1))
                        .stroke(gaugeColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeInOut(duration: 0.6), value: warning)

                    VStack(spacing: 4) {
                        Text(String(format: "%.2f", hf))
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .foregroundStyle(gaugeColor)
                            .contentTransition(.numericText())
                        Text("Health factor")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 140, height: 140)
                .scaleEffect(warning ? 1.04 : 1)
                .animation(.easeInOut(duration: 0.5), value: warning)

                HStack(spacing: 12) {
                    riskPill(
                        title: "Liq. ETH price",
                        value: warning ? "$2,840" : "$1,920",
                        warning: warning
                    )
                    riskPill(
                        title: "Status",
                        value: warning ? "At risk" : "Healthy",
                        warning: warning
                    )
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.primary.opacity(0.04))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(warning ? Color.orange.opacity(0.35) : Color.clear, lineWidth: 1.5)
                    .animation(.easeInOut(duration: 0.4), value: warning)
            )
        }
    }

    private func riskPill(title: String, value: String, warning: Bool) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(warning ? .orange : .primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(warning ? Color.orange.opacity(0.1) : Color.primary.opacity(0.04))
        )
    }
}
