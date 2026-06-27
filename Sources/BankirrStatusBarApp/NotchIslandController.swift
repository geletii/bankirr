import AppKit
import SwiftUI

enum NotchPhase: Equatable {
    case dormant
    case compact
    case expanded
}

@MainActor
final class NotchIslandController: ObservableObject {
    static let shared = NotchIslandController()

    static let pinnedKey = "bankirr.notch.pinned"

    @Published private(set) var phase: NotchPhase = .dormant
    @Published private(set) var isVisible = false
    @Published private(set) var isHoveringNotch = false
    @Published private(set) var isPinned = UserDefaults.standard.bool(forKey: NotchIslandController.pinnedKey)

    private var panel: NotchPanelWindow?
    private var hostingView: NSView?
    private var store: WalletStore?
    private var updater: UpdateManager?
    private weak var coordinator: DisplaySurfaceCoordinator?

    private var dormantTask: Task<Void, Never>?
    private var outsideClickMonitor: Any?

    private let dormantDelay: TimeInterval = 0.5

    private var restingPhase: NotchPhase { isPinned ? .compact : .dormant }

    private init() {}

    func show(store: WalletStore, updater: UpdateManager, coordinator: DisplaySurfaceCoordinator) async {
        self.store = store
        self.updater = updater
        self.coordinator = coordinator
        guard !isVisible else { return }
        isVisible = true
        phase = restingPhase
        ensureWindow(phase: restingPhase)
        panel?.orderFrontRegardless()
    }

    func hide() async {
        guard isVisible else { return }
        dormantTask?.cancel()
        removeOutsideClickMonitor()
        phase = restingPhase
        isHoveringNotch = false
        isVisible = false
        panel?.orderOut(nil)
        panel = nil
        hostingView = nil
    }

    func handleHover(_ hovering: Bool) {
        dormantTask?.cancel()
        isHoveringNotch = hovering
        guard isVisible, phase != .expanded else { return }

        if hovering {
            if phase != .compact {
                phase = .compact
                updateWindowFrame(for: .compact)
            }
        } else if !isPinned {
            dormantTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64((self?.dormantDelay ?? 0.5) * 1_000_000_000))
                guard let self, !Task.isCancelled, self.phase == .compact else { return }
                self.isHoveringNotch = false
                self.phase = .dormant
                self.updateWindowFrame(for: .dormant)
            }
        }
    }

    func togglePin() {
        isPinned.toggle()
        UserDefaults.standard.set(isPinned, forKey: Self.pinnedKey)
        guard phase != .expanded else { return }
        if isPinned {
            phase = .compact
            updateWindowFrame(for: .compact)
        } else if !isHoveringNotch {
            phase = .dormant
            updateWindowFrame(for: .dormant)
        }
    }

    func expand() {
        dormantTask?.cancel()
        isHoveringNotch = true
        phase = .expanded
        updateWindowFrame(for: .expanded)
        NSApp.activate(ignoringOtherApps: true)
        panel?.makeKeyAndOrderFront(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.installOutsideClickMonitor()
        }
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .default)
    }

    func collapse(toDormant: Bool = false) {
        removeOutsideClickMonitor()
        if toDormant {
            isHoveringNotch = false
        }
        let target: NotchPhase = toDormant ? restingPhase : .compact
        phase = target
        updateWindowFrame(for: target)
    }

    func pinToMenuBar() {
        coordinator?.moveToMenuBar()
    }

    func prepareForSurfaceTransition() async {
        collapse(toDormant: true)
        await hide()
    }

    func refreshWindowLayout() {
        guard isVisible else { return }
        updateWindowFrame(for: phase)
    }

    private func ensureWindow(phase: NotchPhase) {
        guard let store, let updater, let coordinator else { return }
        guard panel == nil, let screen = NotchScreenGeometry.notchScreen else { return }

        let showHint = coordinator.isNotchHintIconVisible
        let frame = NotchScreenGeometry.windowFrame(on: screen, phase: phase, showNotchHintIcon: showHint)
        let window = NotchPanelWindow(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        let root = NotchIslandRootView()
            .environmentObject(self)
            .environmentObject(store)
            .environmentObject(updater)
            .environmentObject(coordinator)

        let hosting = FirstMouseHostingView(rootView: AnyView(root))
        // Stop the hosting view from driving the window size via Auto Layout, which
        // throws inside `updateWindowContentSizeExtremaIfNecessary` for a borderless
        // panel and crashes the app on a later constraint pass.
        hosting.sizingOptions = []
        hosting.wantsLayer = true
        hosting.layer?.backgroundColor = NSColor.clear.cgColor

        window.contentView = hosting
        window.setFrame(frame, display: true)

        panel = window
        hostingView = hosting
    }

    private func updateWindowFrame(for phase: NotchPhase) {
        guard let panel, let screen = NotchScreenGeometry.notchScreen else { return }
        let showHint = coordinator?.isNotchHintIconVisible ?? true
        let frame = NotchScreenGeometry.windowFrame(on: screen, phase: phase, showNotchHintIcon: showHint)
        if panel.frame.equalTo(frame) { return }

        let shouldAnimate = phase == .expanded || self.phase == .expanded
        if shouldAnimate {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = phase == .expanded ? 0.3 : 0.22
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().setFrame(frame, display: true)
            }
        } else {
            panel.setFrame(frame, display: true)
        }
    }

    private func installOutsideClickMonitor() {
        guard outsideClickMonitor == nil else { return }
        outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.phase == .expanded else { return }
                guard let panel = self.panel else { return }
                let mouse = NSEvent.mouseLocation
                if !panel.frame.contains(mouse) {
                    self.collapse(toDormant: true)
                }
            }
        }
    }

    private func removeOutsideClickMonitor() {
        if let outsideClickMonitor {
            NSEvent.removeMonitor(outsideClickMonitor)
            self.outsideClickMonitor = nil
        }
    }
}

private final class NotchPanelWindow: NSPanel {
    override init(
        contentRect: NSRect,
        styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType,
        defer flag: Bool
    ) {
        super.init(contentRect: contentRect, styleMask: style, backing: backingStoreType, defer: flag)
        hasShadow = false
        backgroundColor = .clear
        isOpaque = false
        acceptsMouseMovedEvents = true
        level = .statusBar + 1
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        hidesOnDeactivate = false
    }

    override var canBecomeKey: Bool { true }
}

/// Hosting view that accepts the first click even when the panel isn't key,
/// so a single click on the dormant island opens the details immediately.
private final class FirstMouseHostingView: NSHostingView<AnyView> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    @available(*, unavailable)
    @MainActor required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @MainActor required init(rootView: AnyView) {
        super.init(rootView: rootView)
    }
}
