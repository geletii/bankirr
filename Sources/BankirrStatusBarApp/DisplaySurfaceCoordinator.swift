import AppKit
import SwiftUI

/// Chooses between notch island and menu bar via explicit user preference.
@MainActor
final class DisplaySurfaceCoordinator: ObservableObject {
    enum Surface: Equatable {
        case notch
        case menuBar
    }

    enum DisplayPreference: String, CaseIterable {
        case notch
        case menuBar
    }

    static let featureDefaultsKey = "bankirr.notchFeatureEnabled"
    static let displayPreferenceKey = "bankirr.displayPreference"
    static let notchHintIconVisibleKey = "bankirr.notchHintIconVisible"
    /// Legacy key — was incorrectly tied to menu bar extra visibility.
    static let menuBarIconVisibleKey = "bankirr.menuBarIconVisible"
    static let statusItemAutosaveName = "xyz.bankirr.statusbar.main"

    @Published private(set) var surface: Surface = .menuBar
    @Published private(set) var displayPreference: DisplayPreference = .notch
    @Published private(set) var isNotchHintIconVisible = true
    @Published var isMenuBarExtraEnabled = true
    @Published private(set) var isTransitioning = false

    private weak var statusItem: NSStatusItem?
    private var store: WalletStore?
    private var updater: UpdateManager?

    var canSwitchSurface: Bool {
        Self.isFeatureEnabled && NotchScreenGeometry.hasBuiltInNotch
    }

    static var isFeatureEnabled: Bool {
        if UserDefaults.standard.object(forKey: featureDefaultsKey) as? Bool == false {
            return false
        }
        return true
    }

    private static func loadPreference() -> DisplayPreference {
        guard let raw = UserDefaults.standard.string(forKey: displayPreferenceKey),
              let value = DisplayPreference(rawValue: raw) else {
            return .notch
        }
        return value
    }

    private func savePreference(_ preference: DisplayPreference) {
        UserDefaults.standard.set(preference.rawValue, forKey: Self.displayPreferenceKey)
        displayPreference = preference
    }

    func configure(store: WalletStore, updater: UpdateManager) {
        self.store = store
        self.updater = updater
        displayPreference = Self.loadPreference()
    }

    func attach(statusItem: NSStatusItem) {
        self.statusItem = statusItem
        statusItem.autosaveName = Self.statusItemAutosaveName
    }

    func startIfNeeded() {
        displayPreference = Self.loadPreference()
        isNotchHintIconVisible = Self.isNotchHintIconVisiblePreference()

        guard Self.isFeatureEnabled else {
            applyMenuBarOnly(animated: false)
            return
        }
        guard NotchScreenGeometry.hasBuiltInNotch else {
            applyMenuBarOnly(animated: false)
            return
        }

        switch displayPreference {
        case .notch:
            Task { await applyNotchMode(animated: false) }
        case .menuBar:
            applyMenuBarOnly(animated: false)
        }
    }

    func moveToMenuBar() {
        guard canSwitchSurface, surface != .menuBar, !isTransitioning else { return }
        Task { await transition(to: .menuBar) }
    }

    func moveToNotch() {
        guard canSwitchSurface, surface != .notch, !isTransitioning else { return }
        Task { await transition(to: .notch) }
    }

    func showNotchHintIcon() {
        guard surface == .notch else { return }
        UserDefaults.standard.set(true, forKey: Self.notchHintIconVisibleKey)
        isNotchHintIconVisible = true
        NotchIslandController.shared.refreshWindowLayout()
    }

    func hideNotchHintIcon() {
        guard surface == .notch else { return }
        UserDefaults.standard.set(false, forKey: Self.notchHintIconVisibleKey)
        isNotchHintIconVisible = false
        NotchIslandController.shared.refreshWindowLayout()
    }

    // Legacy names kept for any external callers.
    func showMenuBarIcon() { showNotchHintIcon() }
    func hideMenuBarIcon() { hideNotchHintIcon() }

    // Legacy entry points used by older UI strings.
    func pinToMenuBar() { moveToMenuBar() }
    func useNotch() { moveToNotch() }

    private func transition(to target: DisplayPreference) async {
        guard store != nil else { return }
        guard let screen = NotchScreenGeometry.notchScreen else { return }

        isTransitioning = true
        defer { isTransitioning = false }

        if target == .menuBar {
            await NotchIslandController.shared.prepareForSurfaceTransition()
            let from = NotchScreenGeometry.flightIconRect(
                atX: NotchScreenGeometry.notchBitcoinIconFrame(on: screen).midX,
                on: screen
            )
            let to = NotchScreenGeometry.flightIconRect(
                atX: menuBarBitcoinIconFrame(on: screen).midX,
                on: screen
            )
            await DisplaySurfaceMorphAnimator.animate(from: from, to: to)
            savePreference(.menuBar)
            applyMenuBarOnly(animated: false)
        } else {
            guard updater != nil else { return }
            let from = NotchScreenGeometry.flightIconRect(
                atX: menuBarBitcoinIconFrame(on: screen).midX,
                on: screen
            )
            isMenuBarExtraEnabled = false
            try? await Task.sleep(nanoseconds: 80_000_000)
            let to = NotchScreenGeometry.flightIconRect(
                atX: NotchScreenGeometry.notchBitcoinIconFrame(on: screen).midX,
                on: screen
            )
            await DisplaySurfaceMorphAnimator.animate(from: from, to: to)
            savePreference(.notch)
            await applyNotchMode(animated: false)
        }

        NSHapticFeedbackManager.defaultPerformer.perform(.levelChange, performanceTime: .default)
    }

    private func applyMenuBarOnly(animated: Bool) {
        isMenuBarExtraEnabled = true
        surface = .menuBar
        Task {
            await NotchPresenter.hide()
        }
    }

    private func applyNotchMode(animated: Bool) async {
        guard let store, let updater else { return }
        isMenuBarExtraEnabled = false
        isNotchHintIconVisible = Self.isNotchHintIconVisiblePreference()
        surface = .notch
        await NotchPresenter.show(store: store, updater: updater, coordinator: self)
    }

    private static func isNotchHintIconVisiblePreference() -> Bool {
        if UserDefaults.standard.object(forKey: notchHintIconVisibleKey) != nil {
            return UserDefaults.standard.bool(forKey: notchHintIconVisibleKey)
        }
        // Legacy key controlled menu bar extra, not the notch hint — default hint visible.
        return true
    }

    private func menuBarItemFrame(on screen: NSScreen) -> CGRect {
        if let button = statusItem?.button, let window = button.window {
            let frame = window.convertToScreen(button.frame)
            if frame.width > 0, frame.height > 0 {
                return frame
            }
        }
        let metrics = NotchMetrics.current(on: screen)
        return CGRect(
            x: screen.frame.maxX - 132,
            y: metrics.screenMaxY - 24,
            width: 112,
            height: 22
        )
    }

    private func menuBarBitcoinIconFrame(on screen: NSScreen) -> CGRect {
        let itemFrame = menuBarItemFrame(on: screen)
        let iconWidth: CGFloat = 18
        return CGRect(
            x: itemFrame.minX + 2,
            y: itemFrame.midY - itemFrame.height / 2,
            width: iconWidth,
            height: itemFrame.height
        )
    }
}
