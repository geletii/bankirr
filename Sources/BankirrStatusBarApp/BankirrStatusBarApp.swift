import SwiftUI
import AppKit
import Security
import LocalAuthentication
import CoreServices
import Network
import MenuBarExtraAccess

private let TRIAL_SECONDS = 60 * 60
private let appCallbackScheme = "bankirr-statusbar"

extension Notification.Name {
    static let bankirrAuthCallback = Notification.Name("bankirrAuthCallback")
}

enum BankirrConfig {
    static let defaultWebBaseURL = "https://bankirr.xyz"

    static var webBaseURL: String {
        let env = ProcessInfo.processInfo.environment["BANKIRR_API_BASE_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let env, !env.isEmpty {
            return env.hasSuffix("/") ? String(env.dropLast()) : env
        }
        return defaultWebBaseURL
    }

    static var apiBaseURL: URL {
        URL(string: webBaseURL)!
    }

    static var hostLabel: String {
        if let host = URL(string: webBaseURL)?.host, !host.isEmpty { return host }
        return "bankirr.xyz"
    }

    static var dashboardURL: URL? {
        URL(string: webBaseURL)
    }
}

@MainActor
enum StatusBarRightClickSupport {
    private static var monitor: Any?
    private weak static var statusButton: NSStatusBarButton?

    static func attach(from view: NSView, attempt: Int = 0) {
        guard statusButton == nil else { return }
        if let button = findStatusBarButton(from: view) {
            statusButton = button
            installMonitor(for: button)
            return
        }
        guard attempt < 30 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            attach(from: view, attempt: attempt + 1)
        }
    }

    private static func findStatusBarButton(from view: NSView) -> NSStatusBarButton? {
        var current: NSView? = view
        while let candidate = current {
            if let button = candidate as? NSStatusBarButton { return button }
            current = candidate.superview
        }
        return nil
    }

    private static func installMonitor(for button: NSStatusBarButton) {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { event in
            guard let button = statusButton,
                  let buttonWindow = button.window,
                  event.window === buttonWindow else {
                return event
            }
            let location = button.convert(event.locationInWindow, from: nil)
            guard button.bounds.contains(location) else { return event }
            showQuitMenu(on: button)
            return nil
        }
    }

    private static func showQuitMenu(on button: NSStatusBarButton) {
        let menu = NSMenu()
        let quitItem = NSMenuItem(
            title: "Quit Bankirr",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        quitItem.target = NSApp
        menu.addItem(quitItem)
        menu.popUp(positioning: quitItem, at: NSPoint(x: 0, y: button.bounds.height + 4), in: button)
    }
}

private struct StatusBarRightClickDetector: NSViewRepresentable {
    func makeNSView(context: Context) -> DetectorView {
        let view = DetectorView()
        view.isHidden = true
        return view
    }

    func updateNSView(_ nsView: DetectorView, context: Context) {
        StatusBarRightClickSupport.attach(from: nsView)
    }

    final class DetectorView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if window != nil {
                StatusBarRightClickSupport.attach(from: self)
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        BankirrToolTip.configure()
        registerAuthURLHandler()
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            NotificationCenter.default.post(name: .bankirrAuthCallback, object: url)
        }
    }

    private func registerAuthURLHandler() {
        guard let url = URL(string: "\(appCallbackScheme)://auth") else { return }
        LSRegisterURL(url as CFURL, true)
    }
}

// MARK: - In-app updates (Level 1: notify + one-click update)

@MainActor
final class UpdateManager: ObservableObject {
    @Published private(set) var updateAvailable = false
    @Published private(set) var latestVersion: String?
    @Published private(set) var isUpdating = false
    @Published private(set) var status: String?

    private let baseURL: String
    private var checkTask: Task<Void, Never>?

    struct VersionInfo: Decodable { let version: String }

    init() {
        baseURL = BankirrConfig.webBaseURL
        start()
    }

    deinit { checkTask?.cancel() }

    var currentVersion: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0.0"
    }

    func start() {
        checkTask?.cancel()
        checkTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.check()
                // Re-check once a day.
                try? await Task.sleep(nanoseconds: 86_400_000_000_000)
            }
        }
    }

    func check() async {
        guard let url = URL(string: "\(baseURL)/download/version.json") else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            let info = try JSONDecoder().decode(VersionInfo.self, from: data)
            latestVersion = info.version
            updateAvailable = Self.isNewer(info.version, than: currentVersion)
        } catch {
            // Silent: a failed update check should never disrupt the app.
        }
    }

    func performUpdate() {
        guard !isUpdating else { return }
        isUpdating = true
        status = "Downloading update…"
        let base = baseURL
        Task.detached(priority: .userInitiated) {
            await UpdateManager.runUpdate(baseURL: base) { message, finished in
                Task { @MainActor in
                    self.status = message
                    if finished { self.isUpdating = false }
                }
            }
        }
    }

    /// Compares dotted version strings, e.g. "1.2.0" > "1.1.9".
    static func isNewer(_ candidate: String, than current: String) -> Bool {
        let a = candidate.split(separator: ".").map { Int($0) ?? 0 }
        let b = current.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0
            let y = i < b.count ? b[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    /// Downloads the latest .zip, then hands off to a tiny helper script that
    /// waits for this process to quit, swaps the bundle in place, and relaunches.
    nonisolated static func runUpdate(
        baseURL: String,
        report: @escaping (String, Bool) -> Void
    ) async {
        let fm = FileManager.default
        let bundleURL = Bundle.main.bundleURL
        guard bundleURL.pathExtension == "app" else {
            report("Update needs the installed app (run from /Applications).", true)
            return
        }
        guard let zipURL = URL(string: "\(baseURL)/download/Bankirr.zip") else {
            report("Invalid update URL.", true)
            return
        }
        do {
            let tmp = fm.temporaryDirectory.appendingPathComponent("bankirr-update-\(UUID().uuidString)")
            try fm.createDirectory(at: tmp, withIntermediateDirectories: true)

            let (downloaded, response) = try await URLSession.shared.download(from: zipURL)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                report("Download failed.", true)
                return
            }
            let localZip = tmp.appendingPathComponent("Bankirr.zip")
            try fm.moveItem(at: downloaded, to: localZip)

            report("Installing…", false)
            let extractDir = tmp.appendingPathComponent("extract")
            try runProcess("/usr/bin/ditto", ["-x", "-k", localZip.path, extractDir.path])

            guard let newApp = newestApp(in: extractDir, fm: fm) else {
                report("Update archive is missing the app.", true)
                return
            }

            let pid = ProcessInfo.processInfo.processIdentifier
            let script = """
            #!/bin/bash
            while kill -0 \(pid) 2>/dev/null; do sleep 0.4; done
            rm -rf "\(bundleURL.path)"
            /usr/bin/ditto "\(newApp.path)" "\(bundleURL.path)"
            /usr/bin/xattr -dr com.apple.quarantine "\(bundleURL.path)" 2>/dev/null || true
            open "\(bundleURL.path)"
            rm -rf "\(tmp.path)"
            """
            let scriptURL = tmp.appendingPathComponent("update.sh")
            try script.write(to: scriptURL, atomically: true, encoding: .utf8)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)

            let helper = Process()
            helper.executableURL = URL(fileURLWithPath: "/bin/bash")
            helper.arguments = [scriptURL.path]
            try helper.run()

            report("Restarting…", false)
            await MainActor.run { NSApp.terminate(nil) }
        } catch {
            report("Update failed: \(error.localizedDescription)", true)
        }
    }

    private nonisolated static func runProcess(_ launchPath: String, _ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        try process.run()
        process.waitUntilExit()
        if process.terminationStatus != 0 {
            throw NSError(
                domain: "BankirrUpdate",
                code: Int(process.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: "\(launchPath) exited with \(process.terminationStatus)"]
            )
        }
    }

    private nonisolated static func newestApp(in directory: URL, fm: FileManager) -> URL? {
        guard let items = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            return nil
        }
        return items.first { $0.pathExtension == "app" }
    }
}

@main
struct BankirrStatusBarApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var walletStore = WalletStore()
    @StateObject private var updateManager = UpdateManager()
    @StateObject private var surfaceCoordinator = DisplaySurfaceCoordinator()
    @State private var isMenuPresented = false

    var body: some Scene {
        MenuBarExtra {
            MenuBarContentView(store: walletStore, updater: updateManager)
                .environmentObject(surfaceCoordinator)
                .frame(width: 360)
                .padding(.vertical, 6)
        } label: {
            Group {
                if surfaceCoordinator.isMenuBarExtraEnabled {
                    StatusBarLabelView(store: walletStore)
                }
            }
            .onAppear {
                walletStore.handleInitialLaunch()
                surfaceCoordinator.configure(store: walletStore, updater: updateManager)
                surfaceCoordinator.startIfNeeded()
            }
        }
        .menuBarExtraAccess(
            isPresented: $isMenuPresented,
            isEnabled: $surfaceCoordinator.isMenuBarExtraEnabled
        ) { statusItem in
            surfaceCoordinator.attach(statusItem: statusItem)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class OnboardingWindowManager: NSObject, NSWindowDelegate {
    static let shared = OnboardingWindowManager()
    private var window: NSWindow?

    func present(store: WalletStore) {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let onboardingView = InitialOnboardingWindowView(store: store) { [weak self] in
            self?.close()
        }
        let host = NSHostingController(rootView: onboardingView)
        let window = NSWindow(contentViewController: host)
        window.title = "Welcome to Bankirr"
        window.setContentSize(NSSize(width: 430, height: 520))
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.center()
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
    }

    func close() {
        window?.close()
    }

    func windowWillClose(_ notification: Notification) {
        window = nil
    }
}

struct Wallet: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String?
    var address: String
    var remoteID: Int?

    init(
        id: UUID = UUID(),
        name: String?,
        address: String,
        remoteID: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.address = address
        self.remoteID = remoteID
    }
}

enum WalletFormatting {
    static func shortAddress(_ address: String) -> String {
        guard address.count > 12 else { return address }
        return "\(address.prefix(6))…\(address.suffix(4))"
    }

    static func copyToPasteboard(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

struct PortfolioTotals {
    let assets: Double
    let lending: Double
    let debt: Double
    let liquidityPools: Double
    let ethUsd: Double
    let netDaily: Double
    let healthFactor: Double?

    init(
        assets: Double,
        lending: Double,
        debt: Double,
        liquidityPools: Double,
        ethUsd: Double,
        netDaily: Double,
        healthFactor: Double?
    ) {
        self.assets = assets
        self.lending = lending
        self.debt = debt
        self.liquidityPools = liquidityPools
        self.ethUsd = ethUsd
        self.netDaily = netDaily
        self.healthFactor = healthFactor
    }

    init(snapshot: WalletSnapshot) {
        self.init(
            assets: snapshot.assets,
            lending: snapshot.lending,
            debt: snapshot.debt,
            liquidityPools: snapshot.liquidityPools,
            ethUsd: snapshot.ethUsd,
            netDaily: snapshot.netDaily,
            healthFactor: snapshot.healthFactor
        )
    }

    var netWorth: Double {
        assets + lending + liquidityPools - debt
    }

    var netMonthly: Double {
        netDaily * 30
    }

    var netYearly: Double {
        netDaily * 365
    }

    var dailyReturnPercent: Double? {
        guard netWorth > 0 else { return nil }
        return (netDaily / netWorth) * 100
    }

    var monthlyReturnPercent: Double? {
        guard netWorth > 0 else { return nil }
        return (netDaily * 30 / netWorth) * 100
    }

    var yearlyReturnPercent: Double? {
        guard netWorth > 0 else { return nil }
        return (netDaily * 365 / netWorth) * 100
    }

    var liquidationEthPrice: Double? {
        guard ethUsd > 0, let hf = healthFactor, hf.isFinite, hf > 0 else { return nil }
        return ethUsd / hf
    }

    var statusBarRiskColor: StatusBarRiskColor {
        guard debt > 0.01 else { return .neutral }
        guard ethUsd > 0,
              let liquidation = liquidationEthPrice,
              liquidation.isFinite,
              liquidation > 0 else { return .warning }
        let dropFraction = (ethUsd - liquidation) / ethUsd
        return dropFraction > 0.5 ? .safe : .warning
    }
}

enum StatusBarRiskColor: Equatable {
    case neutral
    case safe
    case warning
}

struct WalletSnapshot: Codable, Hashable {
    let assets: Double
    let lending: Double
    let debt: Double
    let liquidityPools: Double
    let netWorth: Double
    let ethUsd: Double
    let netDaily: Double
    let healthFactor: Double?
    let fetchedAt: Date

    var liquidationEthPrice: Double? {
        guard ethUsd > 0, let hf = healthFactor, hf.isFinite, hf > 0 else { return nil }
        return ethUsd / hf
    }
}

enum WalletLoadState: Hashable {
    case idle
    case loading
    case loaded(WalletSnapshot)
    case failed(String)
}

struct WalletRowViewModel: Identifiable, Hashable {
    let id: UUID
    let displayName: String
    let address: String
    let hasCustomName: Bool
    let state: WalletLoadState
}

struct PortfolioSnapshotPayload: Decodable {
    struct NativeAssets: Decodable {
        let assetsUsd: Double?
    }
    struct LendingBlock: Decodable {
        let assetsUsd: Double?
        let debtUsd: Double?
    }
    struct LiquidityBlock: Decodable {
        let assetsUsd: Double?
    }
    struct Market: Decodable {
        let ethUsd: Double?
    }
    struct RenderData: Decodable {
        let netWorth: Double?
        let netDaily: Double?
        let healthFactor: Double?
    }

    let nativeAssets: NativeAssets?
    let spark: LendingBlock?
    let aave: LendingBlock?
    let uniswap: LiquidityBlock?
    let market: Market?
    let renderData: RenderData?
    let fetchedAt: Double?
}

struct BatchPortfolioResponse: Decodable {
    struct Entry: Decodable {
        let ok: Bool
        let snapshot: PortfolioSnapshotPayload?
        let error: String?
    }

    struct Market: Decodable {
        let ethUsd: Double?
        let gasGwei: Double?
        let transferGasUsd: Double?
    }

    let market: Market?
    let results: [String: Entry]
}

struct MarketAPIResponse: Decodable {
    let ethUsd: Double?
    let gasGwei: Double?
    let transferGasUsd: Double?
}

struct PortfolioBatchResult {
    var snapshots: [String: WalletSnapshot] = [:]
    var errors: [String: String] = [:]
    var market: NetworkMarketConditions?
}

struct BankirrUser: Codable, Hashable {
    let id: Int
    let email: String
    let role: String
    let trialStartedAt: Int?
    let subscriptionStatus: String?
    let subscriptionExpiresAt: Int?
    let billingProvider: String?
    let billingCustomerID: String?

    enum CodingKeys: String, CodingKey {
        case id, email, role
        case trialStartedAt = "trial_started_at"
        case subscriptionStatus = "subscription_status"
        case subscriptionExpiresAt = "subscription_expires_at"
        case billingProvider = "billing_provider"
        case billingCustomerID = "billing_customer_id"
    }
}

struct EntitlementPayload: Codable, Hashable {
    let access: String
    let reason: String
    let expiresAt: Int?
    let trialEndsAt: Int?
    let paymentLink: String?
    let paypalLink: String?
    let manageUrl: String?

    enum CodingKeys: String, CodingKey {
        case access, reason
        case expiresAt = "expiresAt"
        case trialEndsAt = "trialEndsAt"
        case paymentLink = "paymentLink"
        case paypalLink = "paypalLink"
        case manageUrl = "manageUrl"
    }
}

struct CodeVerifyResponse: Decodable {
    let token: String
    let user: BankirrUser
    let entitlement: EntitlementPayload
}

struct EntitlementResponse: Decodable {
    let user: BankirrUser
    let entitlement: EntitlementPayload
}

struct LoginResponse: Decodable {
    let token: String
    let user: BankirrUser
}

struct ActivateSubscriptionCodeResponse: Decodable {
    let ok: Bool
    let user: BankirrUser?
    let entitlement: EntitlementPayload
}

struct RedeemSubscriptionResponse: Decodable {
    let ok: Bool
    let user: BankirrUser?
    let entitlement: EntitlementPayload
}

struct DeviceStatusResponse: Decodable {
    let deviceId: String?
    let email: String?
    let manageUrl: String?
    let billingPortalAvailable: Bool?
    let entitlement: EntitlementPayload
}

struct WalletListResponse: Decodable {
    struct RemoteWallet: Decodable {
        let id: Int
        let address: String
        let label: String?
    }
    let wallets: [RemoteWallet]
}

struct AddWalletResponse: Decodable {
    struct RemoteWallet: Decodable {
        let id: Int
        let address: String
        let label: String?
    }
    let wallet: RemoteWallet
}

enum AccessState: String {
    case freeTrial = "free_trial"
    case active = "active"
    case expired = "expired"
}

/// Persists the auth JWT on disk (Application Support). No Keychain access.
enum TokenStore {
    private static let fileName = "auth-token"
    private static let legacyKeychainAccount = "bankirr.statusbar.jwt.v1"
    private static let legacyKeychainPurgedKey = "bankirr.statusbar.legacyKeychainPurged.v1"

    static func get() -> String? {
        purgeLegacyKeychainItemIfNeeded()
        guard let data = try? Data(contentsOf: fileURL),
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty else { return nil }
        return token
    }

    static func set(_ token: String) {
        do {
            try ensureStorageDirectory()
            try Data(token.utf8).write(to: fileURL, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: NSNumber(value: 0o600)],
                ofItemAtPath: fileURL.path
            )
        } catch {
            print("TokenStore.set failed: \(error.localizedDescription)")
        }
    }

    static func delete() {
        try? FileManager.default.removeItem(at: fileURL)
    }

    private static var storageDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("BankirrStatusBarApp", isDirectory: true)
    }

    private static var fileURL: URL {
        storageDirectory.appendingPathComponent(fileName)
    }

    private static func ensureStorageDirectory() throws {
        try FileManager.default.createDirectory(
            at: storageDirectory,
            withIntermediateDirectories: true
        )
    }

    /// One-time cleanup for upgrades from builds that stored JWT in Keychain.
    /// Deletes without reading so macOS never shows a Keychain access prompt.
    private static func purgeLegacyKeychainItemIfNeeded() {
        guard !UserDefaults.standard.bool(forKey: legacyKeychainPurgedKey) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: legacyKeychainAccount
        ]
        SecItemDelete(query as CFDictionary)
        UserDefaults.standard.set(true, forKey: legacyKeychainPurgedKey)
    }
}

/// Persists last-known entitlement on disk (Application Support). No Keychain.
enum EntitlementCache {
    struct Payload: Codable {
        let deviceId: String
        var device: EntitlementPayload?
        var account: EntitlementPayload?
        let cachedAt: Int
    }

    private static let fileName = "entitlement-cache.json"

    private static var storageDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("BankirrStatusBarApp", isDirectory: true)
    }

    private static var fileURL: URL {
        storageDirectory.appendingPathComponent(fileName)
    }

    static func load() -> Payload? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(Payload.self, from: data)
    }

    static func save(_ payload: Payload) {
        do {
            try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(payload)
            try data.write(to: fileURL, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: NSNumber(value: 0o600)],
                ofItemAtPath: fileURL.path
            )
        } catch {
            print("EntitlementCache.save failed: \(error.localizedDescription)")
        }
    }
}

extension NSError {
    var isUnauthorizedAPIError: Bool {
        domain == "BankirrAPI" && code == 401
    }
}

struct BankirrAPIClient {
    let baseURL: URL

    static func makeDefault() -> BankirrAPIClient {
        BankirrAPIClient(baseURL: BankirrConfig.apiBaseURL)
    }

    func requestCode(email: String) async throws -> String? {
        struct Response: Decodable { let devCode: String? }
        let response: Response = try await send(
            path: "/api/auth/code/request",
            method: "POST",
            body: ["email": email]
        )
        return response.devCode
    }

    func verifyCode(email: String, code: String) async throws -> CodeVerifyResponse {
        try await send(
            path: "/api/auth/code/verify",
            method: "POST",
            body: ["email": email, "code": code]
        )
    }

    func login(email: String, password: String) async throws -> LoginResponse {
        try await send(
            path: "/api/auth/login",
            method: "POST",
            body: ["email": email, "password": password]
        )
    }

    func getEntitlement(token: String) async throws -> EntitlementResponse {
        try await send(path: "/api/entitlement/status", token: token)
    }

    func getWallets(token: String) async throws -> [Wallet] {
        let response: WalletListResponse = try await send(path: "/api/wallets", token: token)
        return response.wallets.map {
            Wallet(name: $0.label, address: $0.address, remoteID: $0.id)
        }
    }

    func addWallet(token: String, address: String, label: String?) async throws -> Wallet {
        var payload: [String: Any] = ["address": address]
        if let label, !label.isEmpty {
            payload["label"] = label
        }
        let response: AddWalletResponse = try await send(
            path: "/api/wallets",
            method: "POST",
            token: token,
            body: payload
        )
        return Wallet(name: response.wallet.label, address: response.wallet.address, remoteID: response.wallet.id)
    }

    func deleteWallet(token: String, remoteID: Int) async throws {
        struct Empty: Decodable {}
        _ = try await send(path: "/api/wallets/\(remoteID)", method: "DELETE", token: token) as Empty
    }

    func activateSubscriptionCode(token: String, code: String, deviceId: String) async throws -> ActivateSubscriptionCodeResponse {
        try await send(
            path: "/api/subscription/activate-code",
            method: "POST",
            token: token,
            body: ["code": code, "deviceId": deviceId]
        )
    }

    func redeemSubscriptionCode(code: String, deviceId: String, email: String?) async throws -> RedeemSubscriptionResponse {
        var body: [String: Any] = ["code": code, "deviceId": deviceId]
        if let email, !email.isEmpty {
            body["email"] = email
        }
        return try await send(
            path: "/api/subscription/redeem",
            method: "POST",
            body: body
        )
    }

    func getDeviceSubscriptionStatus(deviceId: String) async throws -> DeviceStatusResponse {
        try await send(path: "/api/subscription/device-status?deviceId=\(deviceId)")
    }

    func getMarket() async throws -> NetworkMarketConditions {
        let response: MarketAPIResponse = try await send(path: "/api/market")
        return NetworkMarketConditions.fromAPI(
            ethUsd: response.ethUsd,
            gasGwei: response.gasGwei,
            transferGasUsd: response.transferGasUsd
        )
    }

    func getPortfolioBatch(
        token: String?,
        deviceId: String,
        addresses: [String],
        forceRefresh: Bool,
        timeout: TimeInterval = 180
    ) async throws -> PortfolioBatchResult {
        var result = PortfolioBatchResult()
        guard !addresses.isEmpty else { return result }

        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/portfolio/batch"),
            resolvingAgainstBaseURL: false
        )
        var queryItems = [
            URLQueryItem(name: "addresses", value: addresses.joined(separator: ",")),
            URLQueryItem(name: "deviceId", value: deviceId)
        ]
        if forceRefresh {
            queryItems.append(URLQueryItem(name: "forceRefresh", value: "1"))
        }
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw NSError(domain: "BankirrAPI", code: -1, userInfo: [NSLocalizedDescriptionKey: "Bad portfolio URL"])
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        // Server-side aggregation can take ~60s on a cold cache with multiple wallets.
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "BankirrAPI", code: -1, userInfo: [NSLocalizedDescriptionKey: "No HTTP response"])
        }
        if !(200...299).contains(http.statusCode) {
            let message = parseErrorMessage(from: data) ?? "API error \(http.statusCode)"
            throw NSError(domain: "BankirrAPI", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }

        let decoded = try JSONDecoder().decode(BatchPortfolioResponse.self, from: data)
        if let market = decoded.market {
            result.market = NetworkMarketConditions.fromAPI(
                ethUsd: market.ethUsd,
                gasGwei: market.gasGwei,
                transferGasUsd: market.transferGasUsd
            )
        }
        for (input, entry) in decoded.results {
            if entry.ok, let payload = entry.snapshot {
                result.snapshots[input] = Self.parseSnapshot(payload)
            } else if let error = entry.error {
                result.errors[input] = error
            } else {
                result.errors[input] = "Snapshot not available"
            }
        }
        return result
    }

    static func parseSnapshot(_ payload: PortfolioSnapshotPayload) -> WalletSnapshot {
        let assets = payload.nativeAssets?.assetsUsd ?? 0
        let lending = (payload.spark?.assetsUsd ?? 0) + (payload.aave?.assetsUsd ?? 0)
        let debt = (payload.spark?.debtUsd ?? 0) + (payload.aave?.debtUsd ?? 0)
        let pools = payload.uniswap?.assetsUsd ?? 0
        let netWorth = payload.renderData?.netWorth ?? (assets + lending + pools - debt)
        let ethUsd = payload.market?.ethUsd ?? 0
        let netDaily = payload.renderData?.netDaily ?? 0
        let healthFactor = payload.renderData?.healthFactor
        let fetchedAt = payload.fetchedAt.map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()

        return WalletSnapshot(
            assets: assets,
            lending: lending,
            debt: debt,
            liquidityPools: pools,
            netWorth: netWorth,
            ethUsd: ethUsd,
            netDaily: netDaily,
            healthFactor: healthFactor,
            fetchedAt: fetchedAt
        )
    }

    private func send<T: Decodable>(
        path: String,
        method: String = "GET",
        token: String? = nil,
        body: [String: Any]? = nil
    ) async throws -> T {
        let normalizedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let url = baseURL.appendingPathComponent(normalizedPath)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "BankirrAPI", code: -1, userInfo: [NSLocalizedDescriptionKey: "No HTTP response"])
        }
        if !(200...299).contains(http.statusCode) {
            let message = parseErrorMessage(from: data) ?? "API error \(http.statusCode)"
            throw NSError(domain: "BankirrAPI", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func parseErrorMessage(from data: Data) -> String? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = json["error"] as? String
        else { return nil }
        return message
    }
}

final class AuthCallbackServer {
    static let shared = AuthCallbackServer()
    static let callbackPort: UInt16 = 38473

    private var listener: NWListener?
    private let queue = DispatchQueue(label: "bankirr.auth-callback")
    private var tokenHandler: ((String) -> Void)?

    func start(tokenHandler: @escaping (String) -> Void) {
        stop()
        self.tokenHandler = tokenHandler
        do {
            guard let port = NWEndpoint.Port(rawValue: Self.callbackPort) else { return }
            let listener = try NWListener(using: .tcp, on: port)
            self.listener = listener
            listener.newConnectionHandler = { [weak self] connection in
                self?.handle(connection)
            }
            listener.start(queue: queue)
        } catch {
            print("AuthCallbackServer failed to start: \(error.localizedDescription)")
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        tokenHandler = nil
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            let firstLine = request.split(separator: "\r\n", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
            let parts = firstLine.split(separator: " ")
            guard parts.count >= 2 else {
                connection.cancel()
                return
            }
            let pathWithQuery = String(parts[1])
            guard let components = URLComponents(string: "http://127.0.0.1\(pathWithQuery)"),
                  let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
                  !token.isEmpty else {
                connection.cancel()
                return
            }

            let html = """
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>Bankirr</title></head>\
            <body style="font-family:-apple-system,sans-serif;background:#0f1419;color:#f4f7fb;display:grid;place-items:center;min-height:100vh;margin:0">\
            <p>Signed in. Return to the Bankirr menu bar app.</p></body></html>
            """
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: \(html.utf8.count)\r\n\r\n\(html)"
            connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })

            Task { @MainActor in
                self.tokenHandler?(token)
            }
        }
    }
}

struct NetworkMarketConditions: Equatable {
    var ethUsd: Double = 0
    var gasGwei: Double?
    var transferGasUsd: Double?

    static func fromAPI(ethUsd: Double?, gasGwei: Double?, transferGasUsd: Double?) -> NetworkMarketConditions {
        NetworkMarketConditions(
            ethUsd: ethUsd ?? 0,
            gasGwei: gasGwei,
            transferGasUsd: transferGasUsd
        )
    }
}

@MainActor
final class WalletStore: ObservableObject {
    @Published private(set) var wallets: [Wallet] = []
    @Published private(set) var snapshots: [UUID: WalletSnapshot] = [:]
    @Published private(set) var loadingStates: [UUID: String] = [:]
    @Published private(set) var errors: [UUID: String] = [:]
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastRefreshedAt: Date?
    @Published private(set) var user: BankirrUser?
    @Published private(set) var entitlement: EntitlementPayload?
    @Published private(set) var deviceEntitlement: EntitlementPayload?
    @Published private(set) var isBootstrapping = true
    @Published var authEmail = ""
    @Published var authPassword = ""
    @Published var authEmailCode = ""
    @Published var subscriptionCode = ""
    @Published var authBusy = false
    @Published var authMessage: String?
    @Published private(set) var networkConditions = NetworkMarketConditions()

    private let storageURL: URL
    private let deviceIdStorageKey = "bankirr.statusbar.deviceId.v1"
    private let localTrialStartedAtKey = "bankirr.statusbar.localTrialStartedAt.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let api = BankirrAPIClient.makeDefault()
    private let initialOnboardingKey = "bankirr.menuBar.initialOnboardingShown.v1"
    private var didCheckInitialLaunch = false
    private var autoRefreshTask: Task<Void, Never>?
    private var entitlementRefreshTask: Task<Void, Never>?
    private var walletRefreshTask: Task<Void, Never>?
    private var networkConditionsTask: Task<Void, Never>?
    private static let manualRefreshTimeout: TimeInterval = 45
    private static let backgroundRefreshTimeout: TimeInterval = 180
    /// Background entitlement polling when subscription is far from expiry.
    private static let entitlementRoutineInterval: TimeInterval = 12 * 3600
    /// Poll more often as expiry approaches.
    private static let entitlementApproachingInterval: TimeInterval = 30 * 60
    /// Poll frequently after local expiry to detect renewal on the server.
    private static let entitlementRenewalWatchInterval: TimeInterval = 3 * 60
    private static let entitlementApproachingWindow: TimeInterval = 24 * 3600
    private var authCallbackObserver: NSObjectProtocol?
    private var lastAuthTokenFingerprint: String?
    private var lastAuthTokenAt: Date?
    private var cachedDeviceEntitlement: EntitlementPayload?
    private var cachedAccountEntitlement: EntitlementPayload?
    /// Bumped when the wallet list changes so in-flight portfolio refreshes cannot write stale snapshots.
    private var portfolioListGeneration: UInt64 = 0

    private func invalidateInFlightPortfolioRefresh() {
        portfolioListGeneration &+= 1
        walletRefreshTask?.cancel()
        walletRefreshTask = nil
    }

    private func pruneOrphanSnapshots() {
        let activeIDs = Set(wallets.map(\.id))
        for id in snapshots.keys where !activeIDs.contains(id) {
            snapshots[id] = nil
        }
    }

    init() {
        self.storageURL = Self.makeStorageURL()
        applyEntitlementCacheIfNeeded()
        loadWallets()
        pruneOrphanSnapshots()
        Task {
            await bootstrapSession()
            await refreshAllWallets(manual: false)
            await refreshNetworkConditions()
        }
        startAutoRefresh()
        startNetworkConditionsRefresh()
        startEntitlementRefresh()
        authCallbackObserver = NotificationCenter.default.addObserver(
            forName: .bankirrAuthCallback,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let url = notification.object as? URL else { return }
            Task { @MainActor in
                await self?.handleAuthCallback(url: url)
            }
        }
        AuthCallbackServer.shared.start { [weak self] token in
            Task { @MainActor in
                await self?.completeAuthFromToken(token)
            }
        }
    }

    deinit {
        autoRefreshTask?.cancel()
        entitlementRefreshTask?.cancel()
        walletRefreshTask?.cancel()
        networkConditionsTask?.cancel()
        if let authCallbackObserver {
            NotificationCenter.default.removeObserver(authCallbackObserver)
        }
    }

    private func startAutoRefresh() {
        autoRefreshTask?.cancel()
        autoRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 120_000_000_000)
                guard let self, !Task.isCancelled else { break }
                await self.refreshAllWallets(manual: false)
            }
        }
    }

    private func startNetworkConditionsRefresh() {
        networkConditionsTask?.cancel()
        networkConditionsTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshNetworkConditions()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    func refreshNetworkConditions() async {
        do {
            let market = try await api.getMarket()
            applyNetworkConditions(market, source: "getMarket")
        } catch {
            print("Market refresh failed: \(error.localizedDescription)")
        }
    }

    private func applyNetworkConditions(_ market: NetworkMarketConditions, source: String = "unknown") {
        var next = networkConditions
        if market.ethUsd > 0 { next.ethUsd = market.ethUsd }
        if let gasGwei = market.gasGwei { next.gasGwei = gasGwei }
        if let transferGasUsd = market.transferGasUsd { next.transferGasUsd = transferGasUsd }
        networkConditions = next
    }

    var marketEthUsd: Double { networkConditions.ethUsd }

    var marketGasGwei: Double? { networkConditions.gasGwei }
    var marketTransferGasUsd: Double? { networkConditions.transferGasUsd }

    private func startEntitlementRefresh() {
        entitlementRefreshTask?.cancel()
        entitlementRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                let delay = await MainActor.run {
                    self?.entitlementRefreshDelaySeconds() ?? Self.entitlementRoutineInterval
                }
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                guard let self, !Task.isCancelled else { break }
                await self.refreshEntitlement()
            }
        }
    }

    /// Seconds until the next background entitlement check.
    /// Launch and sign-in always call `refreshEntitlement()` directly.
    private func entitlementRefreshDelaySeconds() -> TimeInterval {
        let now = Date().timeIntervalSince1970
        guard let boundary = nearestEntitlementExpiryTimestamp else {
            return Self.entitlementRoutineInterval
        }

        let secondsUntilExpiry = Double(boundary) - now
        if secondsUntilExpiry <= 0 {
            return Self.entitlementRenewalWatchInterval
        }
        if secondsUntilExpiry <= Self.entitlementApproachingWindow {
            return Self.entitlementApproachingInterval
        }

        let secondsUntilApproaching = secondsUntilExpiry - Self.entitlementApproachingWindow
        return min(Self.entitlementRoutineInterval, secondsUntilApproaching)
    }

    /// Soonest relevant expiry across account, device, and local demo trial.
    private var nearestEntitlementExpiryTimestamp: Int? {
        var candidates: [Int] = []

        for payload in [effectiveAccountEntitlement, effectiveDeviceEntitlement].compactMap({ $0 }) {
            if let expiresAt = payload.expiresAt {
                candidates.append(expiresAt)
            }
            if let trialEndsAt = payload.trialEndsAt {
                candidates.append(trialEndsAt)
            }
        }

        if !isAuthenticated, let localEndsAt = localTrialEndsAt {
            candidates.append(localEndsAt)
        }

        return candidates.min()
    }

    private var localTrialEndsAt: Int? {
        guard let startedAt = UserDefaults.standard.object(forKey: localTrialStartedAtKey) as? Double else {
            return nil
        }
        return Int(startedAt) + TRIAL_SECONDS
    }

    var hasWallets: Bool {
        !wallets.isEmpty
    }

    var isAuthenticated: Bool {
        user != nil
    }

    var accessState: AccessState {
        if isEntitlementCurrentlyActive(effectiveAccountEntitlement)
            || isEntitlementCurrentlyActive(effectiveDeviceEntitlement) {
            return .active
        }
        if let accountAccess = authenticatedAccessState {
            return accountAccess
        }
        return isLocalTrialActive ? .freeTrial : .expired
    }

    private var effectiveDeviceEntitlement: EntitlementPayload? {
        deviceEntitlement ?? cachedDeviceEntitlement
    }

    private var effectiveAccountEntitlement: EntitlementPayload? {
        guard isAuthenticated else { return nil }
        return entitlement ?? cachedAccountEntitlement
    }

    private func isEntitlementCurrentlyActive(_ payload: EntitlementPayload?) -> Bool {
        guard let payload else { return false }
        let now = Int(Date().timeIntervalSince1970)
        switch payload.access {
        case "active":
            if let expiresAt = payload.expiresAt {
                return expiresAt > now
            }
            return true
        case "free_trial":
            if let trialEndsAt = payload.trialEndsAt {
                return trialEndsAt > now
            }
            return true
        default:
            return false
        }
    }

    private func applyEntitlementCacheIfNeeded() {
        guard let cache = EntitlementCache.load(), cache.deviceId == deviceId else { return }
        cachedDeviceEntitlement = cache.device
        cachedAccountEntitlement = cache.account
        if let device = cache.device {
            deviceEntitlement = device
        }
        if authToken() != nil, let account = cache.account {
            entitlement = account
        }
    }

    private func persistEntitlementCache() {
        EntitlementCache.save(
            EntitlementCache.Payload(
                deviceId: deviceId,
                device: deviceEntitlement ?? cachedDeviceEntitlement,
                account: entitlement ?? cachedAccountEntitlement,
                cachedAt: Int(Date().timeIntervalSince1970)
            )
        )
    }

    var hasEntitlementAccess: Bool {
        accessState == .freeTrial || accessState == .active
    }

    private var authenticatedAccessState: AccessState? {
        guard isAuthenticated, let payload = effectiveAccountEntitlement else { return nil }
        guard let raw = AccessState(rawValue: payload.access) else { return nil }
        switch raw {
        case .active, .freeTrial:
            return isEntitlementCurrentlyActive(payload) ? raw : .expired
        case .expired:
            return .expired
        }
    }

    private var deviceAccessState: AccessState? {
        guard let raw = effectiveDeviceEntitlement?.access else { return nil }
        return AccessState(rawValue: raw)
    }

    var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: deviceIdStorageKey), !existing.isEmpty {
            return existing
        }
        let created = UUID().uuidString
        UserDefaults.standard.set(created, forKey: deviceIdStorageKey)
        return created
    }

    var webBaseURL: String { BankirrConfig.webBaseURL }

    var signInURL: URL? {
        var components = URLComponents(string: "\(webBaseURL)/little/connect.html")
        components?.queryItems = [
            URLQueryItem(name: "callback_port", value: String(AuthCallbackServer.callbackPort))
        ]
        return components?.url
    }

    var subscriptionURL: URL? {
        URL(string: "\(webBaseURL)/little/#pricing")
    }

    var manageSubscriptionURL: URL? {
        if let manageUrl = effectiveDeviceEntitlement?.manageUrl ?? entitlement?.manageUrl,
           let url = URL(string: manageUrl) {
            return url
        }
        let encoded = deviceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? deviceId
        return URL(string: "\(webBaseURL)/little/manage.html?deviceId=\(encoded)")
    }

    var paypalLink: URL? {
        if let link = entitlement?.paypalLink, let url = URL(string: link) {
            return url
        }
        if let link = deviceEntitlement?.paypalLink, let url = URL(string: link) {
            return url
        }
        return nil
    }

    var subscriptionActionTitle: String {
        accessState == .active ? "Manage subscription" : "Get code"
    }

    var localTrialRemainingSeconds: Int {
        guard let startedAt = UserDefaults.standard.object(forKey: localTrialStartedAtKey) as? Double else {
            return TRIAL_SECONDS
        }
        let elapsed = Int(Date().timeIntervalSince1970 - startedAt)
        return max(0, TRIAL_SECONDS - elapsed)
    }

    var trialStatusText: String {
        switch accessState {
        case .active:
            if let expiresAt = activeSubscriptionExpiresAt {
                let date = Date(timeIntervalSince1970: TimeInterval(expiresAt))
                let formatted = date.formatted(date: .abbreviated, time: .omitted)
                return "Subscription active until \(formatted)"
            }
            return "Subscription active"
        case .freeTrial:
            if isAuthenticated, let trialEndsAt = entitlement?.trialEndsAt {
                let remaining = max(0, trialEndsAt - Int(Date().timeIntervalSince1970))
                let mins = max(1, remaining / 60)
                return "Trial: \(mins)m left"
            }
            let mins = max(1, localTrialRemainingSeconds / 60)
            return "Demo: \(mins)m left"
        case .expired:
            return isAuthenticated ? "Subscription required" : "Demo expired"
        }
    }

    private var activeSubscriptionExpiresAt: Int? {
        if isEntitlementCurrentlyActive(effectiveAccountEntitlement) {
            return effectiveAccountEntitlement?.expiresAt
        }
        if isEntitlementCurrentlyActive(effectiveDeviceEntitlement) {
            return effectiveDeviceEntitlement?.expiresAt
        }
        return nil
    }

    var accountStatusText: String? {
        guard let email = user?.email else { return nil }
        return "Signed in as \(email)"
    }

    var totals: PortfolioTotals {
        let values = wallets.compactMap { snapshots[$0.id] }
        let finiteHealthFactors = values.compactMap(\.healthFactor).filter { $0.isFinite && $0 > 0 }
        return PortfolioTotals(
            assets: values.reduce(0) { $0 + $1.assets },
            lending: values.reduce(0) { $0 + $1.lending },
            debt: values.reduce(0) { $0 + $1.debt },
            liquidityPools: values.reduce(0) { $0 + $1.liquidityPools },
            ethUsd: values.map(\.ethUsd).max() ?? 0,
            netDaily: values.reduce(0) { $0 + $1.netDaily },
            healthFactor: finiteHealthFactors.isEmpty ? nil : finiteHealthFactors.min()
        )
    }

    var statusBarTitle: String {
        CurrencyFormatting.fullCurrency(totals.netWorth)
    }

    var statusBarLabelRenderToken: String {
        "\(statusBarTitle)|\(totals.statusBarRiskColor)|\(shouldShowStatusAmount)"
    }

    var shouldShowStatusAmount: Bool {
        hasWallets && loadingStates.isEmpty && !snapshots.isEmpty
    }

    private var isAwaitingPortfolioData: Bool {
        hasWallets && wallets.contains { snapshots[$0.id] == nil }
    }

    var isPortfolioLoading: Bool {
        isBootstrapping
            || !loadingStates.isEmpty
            || (hasWallets && snapshots.isEmpty)
            || isAwaitingPortfolioData
    }

    func handleInitialLaunch() {
        guard !didCheckInitialLaunch else { return }
        didCheckInitialLaunch = true
        guard wallets.isEmpty else { return }
        guard !UserDefaults.standard.bool(forKey: initialOnboardingKey) else { return }
        UserDefaults.standard.set(true, forKey: initialOnboardingKey)
        OnboardingWindowManager.shared.present(store: self)
    }

    var rows: [WalletRowViewModel] {
        wallets.map { wallet in
            let hasCustomName = wallet.name?.isEmpty == false
            let displayName = hasCustomName ? wallet.name! : WalletFormatting.shortAddress(wallet.address)
            if loadingStates[wallet.id] != nil {
                return WalletRowViewModel(
                    id: wallet.id,
                    displayName: displayName,
                    address: wallet.address,
                    hasCustomName: hasCustomName,
                    state: .loading
                )
            }
            if let snapshot = snapshots[wallet.id] {
                return WalletRowViewModel(
                    id: wallet.id,
                    displayName: displayName,
                    address: wallet.address,
                    hasCustomName: hasCustomName,
                    state: .loaded(snapshot)
                )
            }
            if let message = errors[wallet.id] {
                return WalletRowViewModel(
                    id: wallet.id,
                    displayName: displayName,
                    address: wallet.address,
                    hasCustomName: hasCustomName,
                    state: .failed(message)
                )
            }
            return WalletRowViewModel(
                id: wallet.id,
                displayName: displayName,
                address: wallet.address,
                hasCustomName: hasCustomName,
                state: .idle
            )
        }
    }

    func addWallet(name: String?, address: String) {
        guard hasEntitlementAccess else {
            authMessage = "Trial expired. Subscribe to add wallets."
            return
        }
        let cleanedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedAddress.isEmpty else { return }
        let trimmedName = name?.trimmingCharacters(in: .whitespacesAndNewlines)

        if wallets.contains(where: { $0.address.caseInsensitiveCompare(cleanedAddress) == .orderedSame }) {
            return
        }

        if let token = authToken() {
            Task {
                do {
                    let created = try await api.addWallet(token: token, address: cleanedAddress, label: trimmedName)
                    invalidateInFlightPortfolioRefresh()
                    wallets.append(created)
                    saveWallets()
                    pruneOrphanSnapshots()
                    await refreshWallets(ids: [created.id], manual: true)
                } catch {
                    authMessage = error.localizedDescription
                }
            }
            return
        }

        invalidateInFlightPortfolioRefresh()
        let newWallet = Wallet(name: trimmedName, address: cleanedAddress)
        wallets.append(newWallet)
        saveWallets()
        Task { await refreshWallets(ids: [newWallet.id], manual: true) }
    }

    func deleteWallets(at offsets: IndexSet) {
        let removedIDs = offsets.compactMap { wallets[safe: $0]?.id }
        invalidateInFlightPortfolioRefresh()
        wallets.remove(atOffsets: offsets)
        for id in removedIDs {
            snapshots[id] = nil
            loadingStates[id] = nil
            errors[id] = nil
        }
        pruneOrphanSnapshots()
        saveWallets()
    }

    func deleteWallet(id: UUID) {
        guard hasEntitlementAccess else {
            authMessage = "Trial expired. Subscribe to manage wallets."
            return
        }
        if let wallet = wallets.first(where: { $0.id == id }),
           let remoteID = wallet.remoteID,
           let token = authToken() {
            Task {
                do {
                    try await api.deleteWallet(token: token, remoteID: remoteID)
                    if let idx = wallets.firstIndex(where: { $0.id == id }) {
                        deleteWallets(at: IndexSet(integer: idx))
                    }
                } catch {
                    authMessage = error.localizedDescription
                }
            }
            return
        }
        guard let index = wallets.firstIndex(where: { $0.id == id }) else { return }
        deleteWallets(at: IndexSet(integer: index))
    }

    func refreshAllWallets(manual: Bool = true) async {
        if !hasEntitlementAccess {
            if manual {
                authMessage = "Trial expired. Activate subscription to refresh balances."
            }
            return
        }

        let ids = Set(wallets.map(\.id))
        guard !ids.isEmpty else { return }

        if manual {
            walletRefreshTask?.cancel()
            let task = Task { @MainActor [weak self] in
                guard let self else { return }
                await self.refreshWallets(ids: ids, manual: true)
            }
            walletRefreshTask = task
            await task.value
            return
        }

        await refreshWallets(ids: ids, manual: false)
    }

    private func refreshWallets(ids: Set<UUID>, manual: Bool) async {
        pruneOrphanSnapshots()
        let targetWallets = wallets.filter { ids.contains($0.id) }
        guard !targetWallets.isEmpty else { return }

        let isFullRefresh = ids.count == wallets.count
        if isFullRefresh {
            isRefreshing = true
        }

        defer {
            if isFullRefresh {
                isRefreshing = false
            }
            if manual {
                for wallet in targetWallets {
                    loadingStates[wallet.id] = nil
                }
            }
        }

        if manual {
            for wallet in targetWallets {
                loadingStates[wallet.id] = "Refreshing..."
                errors[wallet.id] = nil
            }
        }

        let addresses = targetWallets.map(\.address)
        let timeout = manual ? Self.manualRefreshTimeout : Self.backgroundRefreshTimeout
        let listGeneration = portfolioListGeneration

        do {
            let batch = try await api.getPortfolioBatch(
                token: authToken(),
                deviceId: deviceId,
                addresses: addresses,
                forceRefresh: manual,
                timeout: timeout
            )
            guard !Task.isCancelled else { return }
            guard listGeneration == portfolioListGeneration else { return }

            if let market = batch.market {
                applyNetworkConditions(market, source: "portfolioBatch")
            }

            let activeIDs = Set(wallets.map(\.id))
            var didUpdateSnapshot = false
            for wallet in targetWallets {
                if let snapshot = Self.matchSnapshot(for: wallet.address, in: batch.snapshots) {
                    guard activeIDs.contains(wallet.id) else { continue }
                    snapshots[wallet.id] = snapshot
                    didUpdateSnapshot = true
                    if manual {
                        errors[wallet.id] = nil
                    }
                } else if manual, let message = Self.matchError(for: wallet.address, in: batch.errors) {
                    errors[wallet.id] = message
                }
            }
            pruneOrphanSnapshots()
            if didUpdateSnapshot {
                lastRefreshedAt = targetWallets.compactMap { snapshots[$0.id]?.fetchedAt }.max() ?? Date()
                if manual, Self.isTransientNetworkMessage(authMessage) {
                    authMessage = nil
                }
            }
        } catch is CancellationError {
            return
        } catch {
            if manual {
                let message = refreshErrorMessage(error)
                for wallet in targetWallets {
                    errors[wallet.id] = message
                }
            }
        }
    }

    private static func matchSnapshot(for address: String, in snapshots: [String: WalletSnapshot]) -> WalletSnapshot? {
        if let snapshot = snapshots[address] { return snapshot }
        let lower = address.lowercased()
        if let snapshot = snapshots[lower] { return snapshot }
        return snapshots.first { $0.key.lowercased() == lower }?.value
    }

    private static func matchError(for address: String, in errors: [String: String]) -> String? {
        if let message = errors[address] { return message }
        let lower = address.lowercased()
        if let message = errors[lower] { return message }
        return errors.first { $0.key.lowercased() == lower }?.value
    }

    private func readableError(_ error: Error) -> String {
        (error as NSError).localizedDescription
    }

    private func refreshErrorMessage(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorTimedOut {
            return "Refresh timed out. Try again or relaunch the app."
        }
        return readableError(error)
    }

    private static func isTransientNetworkMessage(_ message: String?) -> Bool {
        guard let message else { return false }
        let lower = message.lowercased()
        return lower.contains("timed out")
            || lower.contains("network")
            || lower.contains("internet")
            || lower.contains("offline")
    }

    private func loadWallets() {
        guard let data = try? Data(contentsOf: storageURL) else { return }
        guard let decoded = try? decoder.decode([Wallet].self, from: data) else { return }
        wallets = decoded
    }

    private func saveWallets() {
        do {
            try FileManager.default.createDirectory(
                at: storageURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = try encoder.encode(wallets)
            try data.write(to: storageURL, options: .atomic)
        } catch {
            // Keep the UI responsive even when local persistence fails.
            print("Failed to save wallets: \(error.localizedDescription)")
        }
    }

    private func authToken() -> String? {
        TokenStore.get()
    }

    func loginWithPassword() async {
        let email = authEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let password = authPassword
        guard !email.isEmpty, !password.isEmpty else {
            authMessage = "Enter email and password."
            return
        }
        authBusy = true
        defer { authBusy = false }
        do {
            let response = try await api.login(email: email, password: password)
            await completeSignIn(token: response.token, user: response.user)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func requestEmailCode() async {
        let email = authEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty else {
            authMessage = "Enter your email."
            return
        }
        authBusy = true
        defer { authBusy = false }
        do {
            let devCode = try await api.requestCode(email: email)
            if let devCode {
                authMessage = "Code sent. Dev code: \(devCode)"
            } else {
                authMessage = "Code sent. Check your email."
            }
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func loginWithEmailCode() async {
        let email = authEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let code = authEmailCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            authMessage = "Enter your email."
            return
        }
        guard !code.isEmpty else {
            authMessage = "Enter the code from your email."
            return
        }
        authBusy = true
        defer { authBusy = false }
        do {
            let response = try await api.verifyCode(email: email, code: code)
            await completeSignIn(token: response.token, user: response.user, entitlement: response.entitlement)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func handleAuthCallback(url: URL) async {
        guard url.scheme == appCallbackScheme, url.host == "auth" else { return }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              !token.isEmpty else {
            authMessage = "Sign in callback did not include a token."
            return
        }
        await completeAuthFromToken(token)
    }

    private func completeAuthFromToken(_ token: String) async {
        let fingerprint = String(token.hashValue)
        if let lastAuthTokenFingerprint,
           lastAuthTokenFingerprint == fingerprint,
           let lastAuthTokenAt,
           Date().timeIntervalSince(lastAuthTokenAt) < 5 {
            return
        }
        lastAuthTokenFingerprint = fingerprint
        lastAuthTokenAt = Date()

        NSApp.activate(ignoringOtherApps: true)
        authBusy = true
        defer { authBusy = false }
        TokenStore.set(token)
        await refreshEntitlement()
        if user == nil {
            authMessage = "Signed in, but account details could not be loaded."
            return
        }
        authMessage = "Signed in as \(user!.email)"
        do {
            try await syncWalletsFromBackend()
            await refreshAllWallets(manual: true)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    private func completeSignIn(token: String, user: BankirrUser, entitlement: EntitlementPayload? = nil) async {
        TokenStore.set(token)
        self.user = user
        authPassword = ""
        authEmailCode = ""
        authMessage = "Signed in as \(user.email)"
        if let entitlement {
            self.entitlement = entitlement
            cachedAccountEntitlement = entitlement
            persistEntitlementCache()
        } else {
            await refreshEntitlement()
        }
        do {
            try await syncWalletsFromBackend()
            await refreshAllWallets(manual: true)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func activateSubscriptionCode() async {
        let code = subscriptionCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else {
            authMessage = "Enter activation code."
            return
        }
        authBusy = true
        defer { authBusy = false }
        do {
            if let token = authToken() {
                let response = try await api.activateSubscriptionCode(
                    token: token,
                    code: code,
                    deviceId: deviceId
                )
                if let accountUser = response.user {
                    user = accountUser
                }
                entitlement = response.entitlement
                deviceEntitlement = response.entitlement
                cachedDeviceEntitlement = response.entitlement
                cachedAccountEntitlement = response.entitlement
            } else {
                let response = try await api.redeemSubscriptionCode(
                    code: code,
                    deviceId: deviceId,
                    email: nil
                )
                deviceEntitlement = response.entitlement
                cachedDeviceEntitlement = response.entitlement
            }
            persistEntitlementCache()
            subscriptionCode = ""
            authMessage = accessState == .active
                ? "Subscription activated on this Mac."
                : "Code accepted, but subscription is not active."
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func logout() {
        TokenStore.delete()
        user = nil
        entitlement = nil
        cachedAccountEntitlement = nil
        authEmail = ""
        authPassword = ""
        authEmailCode = ""
        subscriptionCode = ""
        wallets = []
        snapshots = [:]
        loadingStates = [:]
        errors = [:]
        saveWallets()
        persistEntitlementCache()
        authMessage = "Signed out."
    }

    func refreshEntitlement() async {
        let hadAccess = hasEntitlementAccess
        await refreshDeviceEntitlement()
        if let token = authToken() {
            do {
                let response = try await api.getEntitlement(token: token)
                user = response.user
                entitlement = response.entitlement
                cachedAccountEntitlement = response.entitlement
                persistEntitlementCache()
            } catch let error as NSError where error.isUnauthorizedAPIError {
                TokenStore.delete()
                user = nil
                entitlement = nil
                cachedAccountEntitlement = nil
                persistEntitlementCache()
            } catch {
                print("Account entitlement refresh failed: \(error.localizedDescription)")
            }
        }
        if !hadAccess, hasEntitlementAccess {
            await refreshAllWallets(manual: false)
        }
    }

    private func refreshDeviceEntitlement() async {
        do {
            let response = try await api.getDeviceSubscriptionStatus(deviceId: deviceId)
            deviceEntitlement = response.entitlement
            cachedDeviceEntitlement = response.entitlement
            persistEntitlementCache()
        } catch {
            print("Device entitlement refresh failed: \(error.localizedDescription)")
        }
    }

    private func bootstrapSession() async {
        defer { isBootstrapping = false }
        ensureLocalTrialStarted()
        await refreshEntitlement()
        guard authToken() != nil else { return }
        do {
            try await syncWalletsFromBackend()
        } catch let error as NSError where error.isUnauthorizedAPIError {
            TokenStore.delete()
            user = nil
            entitlement = nil
            cachedAccountEntitlement = nil
            persistEntitlementCache()
        } catch {
            print("Wallet sync bootstrap failed: \(error.localizedDescription)")
        }
    }

    private func ensureLocalTrialStarted() {
        if UserDefaults.standard.object(forKey: localTrialStartedAtKey) == nil {
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: localTrialStartedAtKey)
        }
    }

    private var isLocalTrialActive: Bool {
        localTrialRemainingSeconds > 0
    }

    private func syncWalletsFromBackend() async throws {
        guard let token = authToken() else { return }
        let remoteWallets = try await api.getWallets(token: token)

        // Preserve last known balances by address so they don't flicker away on
        // login/sync (wallet ids are regenerated on every fetch).
        var snapshotsByAddress: [String: WalletSnapshot] = [:]
        for wallet in wallets {
            if let snapshot = snapshots[wallet.id] {
                snapshotsByAddress[wallet.address.lowercased()] = snapshot
            }
        }

        wallets = remoteWallets
        var preserved: [UUID: WalletSnapshot] = [:]
        for wallet in remoteWallets {
            if let snapshot = snapshotsByAddress[wallet.address.lowercased()] {
                preserved[wallet.id] = snapshot
            }
        }
        portfolioListGeneration &+= 1
        snapshots = preserved
        pruneOrphanSnapshots()
        loadingStates = [:]
        errors = [:]
        saveWallets()
    }

    private static func makeStorageURL() -> URL {
        let baseURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return baseURL
            .appendingPathComponent("BankirrStatusBarApp", isDirectory: true)
            .appendingPathComponent("wallets.json")
    }
}

enum NetworkSphereDrawing {
    struct ProjectedPoint {
        let location: CGPoint
        let depth: CGFloat
    }

    static func projectedPoints(
        in size: CGSize,
        yaw: Double,
        pointCount: Int,
        radiusScale: CGFloat = 0.34
    ) -> [ProjectedPoint] {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let radius = min(size.width, size.height) * radiusScale
        var points: [ProjectedPoint] = []
        for index in 0..<pointCount {
            let y = 1 - (Double(index) / Double(max(pointCount - 1, 1))) * 2
            let ring = sqrt(max(0, 1 - y * y))
            let theta = Double(index) * .pi * (3 - sqrt(5))
            let x = cos(theta) * ring
            let z = sin(theta) * ring
            let xr = x * cos(yaw) + z * sin(yaw)
            let zr = -x * sin(yaw) + z * cos(yaw)
            let scale = radius / CGFloat(2.6 - zr)
            points.append(
                ProjectedPoint(
                    location: CGPoint(x: center.x + CGFloat(xr) * scale, y: center.y - CGFloat(y) * scale),
                    depth: CGFloat(zr)
                )
            )
        }
        return points
    }

    static func draw(
        in context: inout GraphicsContext,
        size: CGSize,
        yaw: Double,
        pointCount: Int = 72,
        radiusScale: CGFloat = 0.34,
        monochrome: Bool = false
    ) {
        let points = projectedPoints(in: size, yaw: yaw, pointCount: pointCount, radiusScale: radiusScale)
        let radius = min(size.width, size.height) * radiusScale
        let lineColor = monochrome
            ? Color.black.opacity(0.28)
            : Color(red: 0.15, green: 0.82, blue: 0.69, opacity: 0.22)
        let frontDotColor = monochrome ? Color.black : Color(red: 0.56, green: 0.97, blue: 0.90)
        let backDotColor = monochrome ? Color.black.opacity(0.45) : Color(red: 0.29, green: 0.91, blue: 0.78)

        for i in 0..<points.count {
            for j in (i + 1)..<points.count {
                let dx = points[i].location.x - points[j].location.x
                let dy = points[i].location.y - points[j].location.y
                if hypot(dx, dy) < radius * 0.22 {
                    var path = Path()
                    path.move(to: points[i].location)
                    path.addLine(to: points[j].location)
                    context.stroke(path, with: .color(lineColor), lineWidth: monochrome ? 0.65 : 0.8)
                }
            }
        }

        for point in points {
            let dotRadius: CGFloat = point.depth > 0 ? 2.2 : 1.6
            let dot = CGRect(
                x: point.location.x - dotRadius,
                y: point.location.y - dotRadius,
                width: dotRadius * 2,
                height: dotRadius * 2
            )
            context.fill(
                Path(ellipseIn: dot),
                with: .color(point.depth > 0 ? frontDotColor : backDotColor)
            )
        }
    }

}

enum MenuBarLabelColors {
    private static func isDarkAppearance(_ appearance: NSAppearance?) -> Bool {
        guard let appearance else { return false }
        return appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    }

    static func indicatorColor(for risk: StatusBarRiskColor, appearance: NSAppearance? = NSAppearance.currentDrawing()) -> NSColor? {
        let isDark = isDarkAppearance(appearance)
        switch risk {
        case .neutral:
            return nil
        case .safe:
            return isDark
                ? NSColor(red: 0.36, green: 0.91, blue: 0.47, alpha: 1.0)
                : NSColor(red: 0.11, green: 0.49, blue: 0.23, alpha: 1.0)
        case .warning:
            return isDark
                ? NSColor(red: 1.0, green: 0.72, blue: 0.45, alpha: 1.0)
                : NSColor(red: 0.77, green: 0.35, blue: 0.0, alpha: 1.0)
        }
    }
}

enum StatusBarLabelImageFactory {
    private static let font = NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .regular)
    private static let dotDiameter: CGFloat = 5
    private static let dotGap: CGFloat = 4

    static func make(title: String, risk: StatusBarRiskColor) -> NSImage? {
        let textAttributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.labelColor
        ]
        let attributed = NSAttributedString(string: title, attributes: textAttributes)
        let textSize = attributed.size()
        guard textSize.width > 0, textSize.height > 0 else { return nil }

        let showsIndicator = risk != .neutral
        let indicatorWidth = showsIndicator ? dotDiameter + dotGap : 0
        let imageSize = NSSize(
            width: ceil(textSize.width + indicatorWidth) + 2,
            height: ceil(max(textSize.height, dotDiameter))
        )

        let image = NSImage(size: imageSize, flipped: false) { _ in
            var textOriginX: CGFloat = 1

            if let indicatorColor = MenuBarLabelColors.indicatorColor(for: risk) {
                let dotY = (imageSize.height - dotDiameter) / 2
                let dotRect = NSRect(x: textOriginX, y: dotY, width: dotDiameter, height: dotDiameter)
                indicatorColor.setFill()
                NSBezierPath(ovalIn: dotRect).fill()
                textOriginX += dotDiameter + dotGap
            }

            NSAttributedString(string: title, attributes: textAttributes)
                .draw(at: NSPoint(x: textOriginX, y: 0))
            return true
        }
        image.isTemplate = false
        return image
    }
}

struct StatusBarLabelView: View {
    @ObservedObject var store: WalletStore
    @State private var labelImage: NSImage?

    private static let labelFont = Font.system(size: 13, weight: .regular).monospacedDigit()

    var body: some View {
        Group {
            if store.shouldShowStatusAmount {
                if let labelImage {
                    Image(nsImage: labelImage)
                } else {
                    Text(store.statusBarTitle)
                        .font(Self.labelFont)
                }
            } else {
                Image(systemName: "bitcoinsign")
                    .renderingMode(.template)
                    .font(.system(size: 13, weight: .regular))
            }
        }
        .onAppear {
            refreshLabelImage()
        }
        .onChange(of: store.statusBarLabelRenderToken) { _ in
            refreshLabelImage()
        }
        .background(StatusBarRightClickDetector())
    }

    private func refreshLabelImage() {
        guard store.shouldShowStatusAmount else {
            labelImage = nil
            return
        }
        labelImage = StatusBarLabelImageFactory.make(
            title: store.statusBarTitle,
            risk: store.totals.statusBarRiskColor
        )
    }
}

struct InitialOnboardingWindowView: View {
    @ObservedObject var store: WalletStore
    let onClose: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CartoonWelcomeAnimationView()
                .frame(maxWidth: .infinity)

            Text("Welcome to Bankirr")
                .font(.title2.bold())

            SubscriptionCTABanner(store: store, openURL: openURL)

            AccountStatusStrip(store: store, openURL: openURL)

            CollapsibleAddWalletFormView(store: store)

            HStack {
                Button("Later") {
                    onClose()
                }
                .buttonStyle(.bordered)

                Spacer()
            }

            SupportContactLink()

            BetaVersionNotice()
        }
        .padding(16)
        .onChange(of: store.hasWallets) { hasWallets in
            if hasWallets {
                onClose()
            }
        }
    }
}

struct NetworkSphereIconView: View {
    var radiusScale: CGFloat = 0.44

    var body: some View {
        TimelineView(.animation) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                var drawContext = context
                NetworkSphereDrawing.draw(
                    in: &drawContext,
                    size: size,
                    yaw: time * 0.35,
                    radiusScale: radiusScale
                )
            }
        }
        .frame(width: 120, height: 120)
    }
}

struct CartoonWelcomeAnimationView: View {
    var body: some View {
        NetworkSphereIconView()
            .frame(width: 140, height: 112)
    }
}

struct UpdateBanner: View {
    @ObservedObject var updater: UpdateManager

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.down.circle.fill")
                .foregroundStyle(.tint)
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(updater.isUpdating ? "Updating Bankirr…" : "Update available")
                    .font(.subheadline.weight(.semibold))
                Text(updater.status ?? versionLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if updater.isUpdating {
                ProgressView().controlSize(.small)
            } else {
                Button("Update") { updater.performUpdate() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
        }
        .padding(10)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    private var versionLine: String {
        if let latest = updater.latestVersion {
            return "Version \(latest) is ready to install."
        }
        return "A new version is ready to install."
    }
}

struct MenuBarContentView: View {
    @ObservedObject var store: WalletStore
    @ObservedObject var updater: UpdateManager
    @EnvironmentObject private var coordinator: DisplaySurfaceCoordinator
    @Environment(\.openURL) private var openURL
    @State private var showAddWallet = false
    @State private var newWalletAddress = ""
    @State private var newWalletName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if updater.updateAvailable {
                UpdateBanner(updater: updater)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
            }
            content
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isBootstrapping {
            VStack(spacing: 10) {
                ProgressView()
                Text("Checking subscription…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(width: 360)
            .padding(12)
        } else if !store.hasEntitlementAccess {
            SubscriptionGateView(store: store, openURL: openURL)
        } else if store.hasWallets {
            VStack(alignment: .leading, spacing: 10) {
                if store.accessState != .active {
                    SubscriptionCTABanner(store: store, openURL: openURL)
                }

                headerBar

                DisplaySurfaceToggle(coordinator: coordinator, style: .prominent)
                    .frame(maxWidth: .infinity, alignment: .leading)

                heroCard
                riskCard
                breakdownCard
                walletsCard
                footerSection
            }
            .padding(.horizontal, 12)
        } else {
            FirstLaunchView(store: store)
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Bankirr")
                    .font(.headline)
                TrialBadge(
                    text: store.trialStatusText,
                    active: store.accessState == .active
                )
            }

            Spacer(minLength: 8)

            RefreshIconButton(isRefreshing: store.isRefreshing) {
                Task { await store.refreshAllWallets(manual: true) }
            }

            MenuSettingsMenu(store: store, openURL: openURL)
        }
    }

    private var heroCard: some View {
        MenuCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Net worth")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    if store.marketEthUsd > 0 {
                        Text("ETH \(CurrencyFormatting.compactUsd(store.marketEthUsd))")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(.quaternary.opacity(0.5), in: Capsule())
                    }
                }

                Text(CurrencyFormatting.fullCurrency(store.totals.netWorth))
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)

                HStack(spacing: 10) {
                    DailyChangePill(
                        value: CurrencyFormatting.signedUsd(store.totals.netDaily) + "/day",
                        positive: store.totals.netDaily >= 0
                    )
                    if store.marketEthUsd > 0 {
                        DailyChangePill(
                            value: CurrencyFormatting.ethAmount(store.totals.netDaily / store.marketEthUsd) + "/day",
                            positive: store.totals.netDaily >= 0,
                            tinted: false
                        )
                    }
                }

                if let refreshed = store.lastRefreshedAt {
                    Label("Updated \(refreshed.formatted(date: .omitted, time: .shortened))", systemImage: "clock")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else if store.isRefreshing {
                    Label("Updating in background…", systemImage: "arrow.clockwise")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var riskCard: some View {
        let atRisk = (store.totals.healthFactor ?? .infinity) < 1.5
        return MenuCard {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(
                    title: "Risk",
                    systemImage: atRisk ? "exclamationmark.triangle.fill" : "shield.lefthalf.filled",
                    tint: atRisk ? .orange : .secondary
                )
                HStack(spacing: 8) {
                    MetricPill(
                        title: "Health factor",
                        value: MetricFormatting.healthFactor(store.totals.healthFactor),
                        warning: atRisk
                    )
                    MetricPill(
                        title: "Liq. ETH price",
                        value: MetricFormatting.liquidationPrice(store.totals.liquidationEthPrice),
                        warning: atRisk
                    )
                }
            }
        }
    }

    private var breakdownCard: some View {
        MenuCard {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(title: "Breakdown", systemImage: "chart.pie.fill", tint: .secondary)
                HStack(spacing: 8) {
                    StatPill(title: "Holdings", value: store.totals.assets)
                    StatPill(title: "Lending", value: store.totals.lending)
                }
                HStack(spacing: 8) {
                    StatPill(title: "Debt", value: -store.totals.debt, negative: true)
                    StatPill(title: "Pools", value: store.totals.liquidityPools)
                }
            }
        }
    }

    private var walletsCard: some View {
        MenuCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    SectionLabel(title: "Wallets", systemImage: "wallet.pass.fill", tint: .secondary)
                    Spacer()
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            showAddWallet.toggle()
                        }
                    } label: {
                        Image(systemName: showAddWallet ? "xmark" : "plus")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 24, height: 24)
                            .background(.quaternary.opacity(0.5), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .bankirrHelp(showAddWallet ? "Cancel" : "Add wallet")
                }

                if showAddWallet {
                    menuBarAddWalletForm
                }

                VStack(spacing: 6) {
                    ForEach(store.rows) { wallet in
                        MenuBarWalletRow(wallet: wallet, store: store, openURL: openURL)
                    }
                }
            }
        }
    }

    private var menuBarAddWalletForm: some View {
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
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.quaternary.opacity(0.25))
        )
    }

    private var footerSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let accountStatus = store.accountStatusText {
                Text(accountStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let message = store.authMessage, message != store.accountStatusText {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(store.accessState == .active ? .green : .secondary)
            }

            Button {
                guard let url = BankirrConfig.dashboardURL else { return }
                openURL(url)
            } label: {
                Label("Open full dashboard: \(BankirrConfig.hostLabel)", systemImage: "arrow.up.forward.app")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.link)
            .frame(maxWidth: .infinity, alignment: .leading)

            SupportContactLink()
            BetaVersionNotice()
        }
    }
}

struct FirstLaunchView: View {
    @ObservedObject var store: WalletStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Welcome to Bankirr")
                .font(.title3.bold())

            SubscriptionCTABanner(store: store, openURL: openURL)

            AccountStatusStrip(store: store, openURL: openURL)

            CollapsibleAddWalletFormView(store: store)

            Text("Add a wallet to see your total in the menu bar.")
                .font(.caption)
                .foregroundStyle(.secondary)

            SupportContactLink()

            BetaVersionNotice()
        }
        .padding(12)
        .frame(width: 360)
    }
}

struct BrowserSignInLink: View {
    @ObservedObject var store: WalletStore
    let openURL: OpenURLAction

    var body: some View {
        Button("Sign in") {
            guard let url = store.signInURL else { return }
            openURL(url)
        }
        .buttonStyle(.link)
        .disabled(store.authBusy)
    }
}

struct SupportContactLink: View {
    static let email = "friend@bankirr.xyz"
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            guard let url = URL(string: "mailto:\(Self.email)?subject=Bankirr") else { return }
            openURL(url)
        } label: {
            Text("Questions? Say hi at \(Self.email)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct BetaVersionNotice: View {
    var body: some View {
        Text("Beta version. If something looks wrong, quit and reopen the app.")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SubscriptionCTABanner: View {
    @ObservedObject var store: WalletStore
    let openURL: OpenURLAction
    @State private var showCodeEntry = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if store.accessState == .active {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Subscription active")
                            .font(.subheadline.weight(.semibold))
                        Text("Manage billing or change your plan.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Button(store.subscriptionActionTitle) {
                        openSubscriptionAction()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Try free for 1 hour, then subscribe")
                        .font(.subheadline.weight(.semibold))
                    Text("Get an activation code at \(BankirrConfig.hostLabel) — enter it here or in Settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        Button(store.subscriptionActionTitle) {
                            openSubscriptionAction()
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)

                        Button(showCodeEntry ? "Hide code" : "Enter code") {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                showCodeEntry.toggle()
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }

                if showCodeEntry {
                    HStack(spacing: 8) {
                        TextField("Activation code", text: $store.subscriptionCode)
                            .textFieldStyle(.roundedBorder)
                            .font(.caption)
                        Button(store.authBusy ? "…" : "Activate") {
                            Task { await store.activateSubscriptionCode() }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(store.authBusy || store.subscriptionCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
        .padding(10)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 10))
    }

    private func openSubscriptionAction() {
        let url = store.accessState == .active
            ? store.manageSubscriptionURL
            : store.subscriptionURL
        guard let url else { return }
        openURL(url)
    }
}

struct AccountStatusStrip: View {
    @ObservedObject var store: WalletStore
    let openURL: OpenURLAction
    var showTrialStatus = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                if showTrialStatus {
                    Text(store.trialStatusText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(store.accessState == .active ? .green : .secondary)
                }

                Spacer(minLength: 8)

                if store.isAuthenticated {
                    Button("Sign out") {
                        store.logout()
                    }
                    .buttonStyle(.link)
                    .font(.caption)
                } else {
                    BrowserSignInLink(store: store, openURL: openURL)
                }

                Menu {
                    Button("Quit Bankirr") {
                        NSApplication.shared.terminate(nil)
                    }
                    .keyboardShortcut("q", modifiers: .command)
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 24, height: 24)
                        .background(.quaternary.opacity(0.5), in: Circle())
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .bankirrHelp("App settings")
            }

            if let accountStatus = store.accountStatusText {
                Text(accountStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let message = store.authMessage, message != store.accountStatusText {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Self.isErrorMessage(message) ? .red : (store.accessState == .active ? .green : .secondary))
            }
        }
    }
}

struct SubscriptionGateView: View {
    @ObservedObject var store: WalletStore
    let openURL: OpenURLAction

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.isAuthenticated ? "Subscription required" : "Trial expired")
                .font(.title3.bold())
            Text(gateDescription)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            SubscriptionCTABanner(store: store, openURL: openURL)

            AccountStatusStrip(store: store, openURL: openURL, showTrialStatus: false)

            SupportContactLink()

            BetaVersionNotice()
        }
        .padding(12)
        .frame(width: 360)
    }

    private var gateDescription: String {
        "Enter your activation code below, or tap Get code to purchase one. Sign in is optional."
    }
}

private extension AccountStatusStrip {
    static func isErrorMessage(_ message: String) -> Bool {
        let lower = message.lowercased()
        return lower.contains("timed out")
            || lower.contains("failed")
            || lower.contains("error")
            || lower.contains("invalid")
            || lower.contains("required")
            || lower.contains("expired")
    }
}

struct CollapsibleAddWalletFormView: View {
    @ObservedObject var store: WalletStore
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    Text("Add wallet")
                        .font(.headline)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                AddWalletFormView(store: store, showTitle: false)
            }
        }
    }
}

struct AddWalletFormView: View {
    @ObservedObject var store: WalletStore
    var showTitle = true

    @State private var name = ""
    @State private var address = ""
    @State private var validationMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if showTitle {
                Text("Add wallet")
                    .font(.headline)
            }
            TextField("Wallet name (optional)", text: $name)
            TextField("Address / ENS", text: $address)

            if let validationMessage {
                Text(validationMessage)
                    .foregroundStyle(.red)
                    .font(.caption)
            }

            Button("Save wallet") {
                saveWallet()
            }
            .buttonStyle(.borderedProminent)
            .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .textFieldStyle(.roundedBorder)
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
        store.addWallet(name: optionalName.isEmpty ? nil : optionalName, address: trimmedAddress)
        validationMessage = nil
        name = ""
        address = ""
    }
}

struct MenuBarWalletRow: View {
    let wallet: WalletRowViewModel
    @ObservedObject var store: WalletStore
    let openURL: OpenURLAction

    var body: some View {
        HStack(spacing: 8) {
            Button {
                guard let url = BankirrLinks.dashboardURL(for: wallet.address) else { return }
                openURL(url)
            } label: {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            if wallet.hasCustomName {
                                Text(wallet.displayName)
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(.secondary)
                            } else {
                                WalletAddressCopyLine(
                                    address: wallet.address,
                                    font: .subheadline.weight(.semibold),
                                    foreground: .primary
                                )
                            }
                        }
                        if wallet.hasCustomName {
                            WalletAddressCopyLine(address: wallet.address)
                        }
                        if case .failed(let message) = wallet.state {
                            Text(message)
                                .font(.caption2)
                                .foregroundStyle(.red)
                                .lineLimit(2)
                        }
                    }
                    Spacer(minLength: 6)
                    walletAmount
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .bankirrHelp("Open on \(BankirrConfig.hostLabel)")

            WalletCopyButton(address: wallet.address)

            Button {
                store.deleteWallet(id: wallet.id)
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 26, height: 26)
                    .background(.quaternary.opacity(0.5), in: Circle())
            }
            .buttonStyle(.plain)
            .bankirrHelp("Remove wallet")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.quaternary.opacity(0.2))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(.white.opacity(0.06), lineWidth: 0.5)
                )
        )
    }

    @ViewBuilder
    private var walletAmount: some View {
        switch wallet.state {
        case .loaded(let snapshot):
            Text(CurrencyFormatting.fullCurrency(snapshot.netWorth))
                .font(.subheadline.weight(.bold).monospacedDigit())
        case .loading, .idle:
            Text("…")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.secondary)
        case .failed:
            Text("Error")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
        }
    }
}

enum BankirrLinks {
    static func dashboardURL(for wallet: String) -> URL? {
        var components = URLComponents(string: "\(BankirrConfig.webBaseURL)/")
        components?.queryItems = [URLQueryItem(name: "wallet", value: wallet)]
        return components?.url
    }
}

struct WalletAddressCopyLine: View {
    let address: String
    var font: Font = .caption2
    var foreground: Color = .secondary

    var body: some View {
        Text(WalletFormatting.shortAddress(address))
            .font(font)
            .foregroundStyle(foreground)
            .lineLimit(1)
    }
}

struct WalletCopyButton: View {
    let address: String
    var foreground: Color = .secondary.opacity(0.85)

    var body: some View {
        Button {
            WalletFormatting.copyToPasteboard(address)
        } label: {
            Image(systemName: "doc.on.doc")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(foreground)
                .frame(width: 18, height: 18)
        }
        .buttonStyle(.plain)
        .bankirrHelp("Copy address")
    }
}

struct RefreshIconButton: View {
    let isRefreshing: Bool
    var iconColor: Color = .secondary
    var backgroundColor: Color?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(iconColor)
                .rotationEffect(.degrees(isRefreshing ? 360 : 0))
                .animation(
                    isRefreshing ? .linear(duration: 0.9).repeatForever(autoreverses: false) : .default,
                    value: isRefreshing
                )
                .frame(width: 24, height: 24)
                .background {
                    if let backgroundColor {
                        Circle().fill(backgroundColor)
                    } else {
                        Circle().fill(.quaternary.opacity(0.5))
                    }
                }
        }
        .buttonStyle(.borderless)
        .disabled(isRefreshing)
        .bankirrHelp("Refresh now")
    }
}

struct MenuCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.quaternary.opacity(0.16))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(.white.opacity(0.06), lineWidth: 0.5)
            )
    }
}

struct SectionLabel: View {
    let title: String
    var systemImage: String? = nil
    var tint: Color = .secondary

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
        }
    }
}

struct TrialBadge: View {
    let text: String
    let active: Bool

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(active ? Color.green : Color.orange)
                .frame(width: 6, height: 6)
            Text(text)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(active ? .green : .secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(
            Capsule().fill((active ? Color.green : Color.orange).opacity(0.12))
        )
    }
}

struct DailyChangePill: View {
    let value: String
    let positive: Bool
    var tinted = true

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: positive ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: 9, weight: .bold))
            Text(value)
                .font(.caption.weight(.semibold))
                .monospacedDigit()
        }
        .foregroundStyle(tinted ? (positive ? Color.green : Color.red) : Color.secondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(
                tinted
                    ? (positive ? Color.green : Color.red).opacity(0.12)
                    : Color.secondary.opacity(0.12)
            )
        )
    }
}

struct MenuSettingsMenu: View {
    @ObservedObject var store: WalletStore
    let openURL: OpenURLAction

    var body: some View {
        Menu {
            if store.isAuthenticated {
                Button("Sign out") {
                    store.logout()
                }
            } else {
                Button("Sign in") {
                    guard let url = store.signInURL else { return }
                    openURL(url)
                }
                .disabled(store.authBusy)
            }

            Button("Open dashboard") {
                guard let url = BankirrConfig.dashboardURL else { return }
                openURL(url)
            }

            Divider()

            Button("Quit Bankirr") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        } label: {
            Image(systemName: "gearshape")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
                .background(.quaternary.opacity(0.5), in: Circle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .bankirrHelp("Account & settings")
    }
}

struct MetricPill: View {
    let title: String
    let value: String
    var positive = true
    var warning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(warning ? .orange : (positive ? .primary : .red))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 9))
    }
}

struct StatPill: View {
    let title: String
    let value: Double
    var negative = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(CurrencyFormatting.fullCurrency(value))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(negative ? .red : .primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 9))
    }
}

enum MetricFormatting {
    static func healthFactor(_ value: Double?) -> String {
        guard let value else { return "—" }
        if value == .infinity { return "∞" }
        guard value.isFinite else { return "—" }
        return String(format: "%.2f", value)
    }

    static func liquidationPrice(_ value: Double?) -> String {
        guard let value, value.isFinite, value > 0 else { return "—" }
        return CurrencyFormatting.compactUsd(value)
    }

    static func signedPercent(_ rate: Double) -> String {
        guard rate.isFinite else { return "—" }
        let prefix = rate >= 0 ? "+" : ""
        if abs(rate) >= 100 {
            return String(format: "%@%.0f%%", prefix, rate)
        }
        if abs(rate) >= 10 {
            return String(format: "%@%.1f%%", prefix, rate)
        }
        return String(format: "%@%.2f%%", prefix, rate)
    }
}

enum CurrencyFormatting {
    static func signedUsd(_ amount: Double) -> String {
        let prefix = amount >= 0 ? "+" : ""
        return prefix + fullCurrency(amount)
    }

    static func signedCompactUsd(_ amount: Double) -> String {
        if abs(amount) < 1_000 {
            return signedUsd(amount)
        }
        let formatted = shortCurrency(amount)
        if amount > 0 {
            return "+\(formatted)"
        }
        return formatted
    }

    static func compactUsd(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 0
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "$0"
    }

    static func ethAmount(_ amount: Double) -> String {
        guard amount.isFinite else { return "— ETH" }
        return String(format: "%.4f ETH", amount)
    }

    static func fullCurrency(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter.string(from: NSNumber(value: amount)) ?? "$0.00"
    }

    static func transferGasUsd(_ amount: Double) -> String {
        guard amount.isFinite, amount > 0 else { return "—" }
        if amount < 0.001 {
            return String(format: "~$%.4f", amount)
        }
        if amount < 0.01 {
            return String(format: "~$%.3f", amount)
        }
        if amount < 1 {
            return String(format: "~$%.2f", amount)
        }
        return "~" + compactUsd(amount)
    }

    static func gwei(_ value: Double) -> String {
        guard value.isFinite, value > 0 else { return "—" }
        if value < 10 {
            return String(format: "%.1f gwei", value)
        }
        return String(format: "%.0f gwei", value)
    }

    static func shortCurrency(_ amount: Double) -> String {
        let sign = amount < 0 ? "-" : ""
        let value = abs(amount)

        switch value {
        case 1_000_000_000...:
            return "\(sign)$\(String(format: "%.2f", value / 1_000_000_000))B"
        case 1_000_000...:
            return "\(sign)$\(String(format: "%.2f", value / 1_000_000))M"
        case 1_000...:
            return "\(sign)$\(String(format: "%.2f", value / 1_000))K"
        default:
            return "\(sign)$\(String(format: "%.0f", value))"
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
