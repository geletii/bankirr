import AppKit
import SwiftUI

enum BankirrToolTip {
    static let showDelay: TimeInterval = 0

    static func configure() {
        guard
            let managerClass = NSClassFromString("NSToolTipManager"),
            let shared = (managerClass as AnyObject).perform?(Selector(("sharedToolTipManager")))?
                .takeUnretainedValue() as? NSObject
        else { return }
        shared.setValue(showDelay, forKey: "initialToolTipDelay")
    }
}

extension View {
    func bankirrHelp(_ text: String) -> some View {
        help(text)
    }
}

enum RiskTooltipFormatting {
    static func liquidationRisk(for totals: PortfolioTotals) -> String {
        guard totals.debt > 0.01 else {
            return "Liquidation risk — no lending debt"
        }
        let price = MetricFormatting.liquidationPrice(totals.liquidationEthPrice)
        switch totals.statusBarRiskColor {
        case .safe:
            return "Liquidation risk — safe margin (liq. ETH \(price))"
        case .warning:
            return "Liquidation risk — ETH near liquidation (\(price))"
        case .neutral:
            return "Liquidation risk from lending positions"
        }
    }
}
