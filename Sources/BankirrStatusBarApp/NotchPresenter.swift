import SwiftUI

@MainActor
enum NotchPresenter {
    static func show(store: WalletStore, updater: UpdateManager, coordinator: DisplaySurfaceCoordinator) async {
        await NotchIslandController.shared.show(store: store, updater: updater, coordinator: coordinator)
    }

    static func hide() async {
        await NotchIslandController.shared.hide()
    }
}
