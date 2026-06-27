import AppKit

struct NotchMetrics {
    /// Kept for compatibility; compact cap now aligns to physical notch bounds.
    let wingLeftWidth: CGFloat
    let wingRightWidth: CGFloat
    let notchWidth: CGFloat
    let notchHeight: CGFloat
    let menubarHeight: CGFloat
    /// Left edge of the physical notch cutout in screen coordinates.
    let notchOriginX: CGFloat
    let notchCenterX: CGFloat
    let screenMaxY: CGFloat

    var wrapWidth: CGFloat { wingLeftWidth + notchWidth + wingRightWidth }

    var wrapOriginX: CGFloat { notchOriginX - wingLeftWidth }

    static func current(on screen: NSScreen) -> NotchMetrics {
        let insetTop = screen.safeAreaInsets.top
        let menubarHeight = max(screen.frame.maxY - screen.visibleFrame.maxY, insetTop > 0 ? insetTop : 24)
        let catalog = NotchModelCatalog.fallback(for: NotchModelCatalog.hardwareModel())

        let leftArea = screen.auxiliaryTopLeftArea ?? .zero
        let rightArea = screen.auxiliaryTopRightArea ?? .zero

        let notchWidth: CGFloat
        let notchHeight: CGFloat
        let notchOriginX: CGFloat
        let wingLeft: CGFloat
        let wingRight: CGFloat

        if insetTop > 0 {
            let measuredNotchWidth = screen.frame.width - leftArea.width - rightArea.width
            let measuredOriginX = screen.frame.minX + leftArea.width
            let maxNotchWidth = screen.frame.width * 0.45
            let minNotchWidth: CGFloat = 80
            let hasValidAuxGeometry =
                leftArea.width > 0 &&
                rightArea.width > 0 &&
                measuredNotchWidth >= minNotchWidth &&
                measuredNotchWidth <= maxNotchWidth &&
                measuredOriginX >= screen.frame.minX &&
                measuredOriginX + measuredNotchWidth <= screen.frame.maxX

            if hasValidAuxGeometry {
                notchWidth = measuredNotchWidth
                notchOriginX = measuredOriginX
                notchHeight = insetTop
            } else {
                // Last-resort path when auxiliary notch geometry is unavailable or inconsistent.
                notchWidth = min(catalog.notchWidth, screen.frame.width * 0.45)
                notchOriginX = screen.frame.midX - notchWidth / 2
                notchHeight = max(insetTop, catalog.notchHeight)
            }
            wingLeft = 0
            wingRight = 0
        } else {
            notchWidth = catalog.notchWidth
            notchHeight = menubarHeight
            notchOriginX = screen.frame.midX - catalog.notchWidth / 2
            wingLeft = 0
            wingRight = 0
        }

        let notchCenterX = notchOriginX + notchWidth / 2

        return NotchMetrics(
            wingLeftWidth: wingLeft,
            wingRightWidth: wingRight,
            notchWidth: notchWidth,
            notchHeight: notchHeight,
            menubarHeight: menubarHeight,
            notchOriginX: notchOriginX,
            notchCenterX: notchCenterX,
            screenMaxY: screen.frame.maxY
        )
    }
}

enum NotchScreenGeometry {
    /// Width of the dropped-down detail panel.
    static let expandedPanelWidth: CGFloat = 340
    /// Visible band that hangs below the physical notch in the compact (hover) state.
    static let compactDrop: CGFloat = 30
    /// Height of the expanded detail content (below the notch clearance).
    static let expandedContentHeight: CGFloat = 360
    /// Breathing room added around the island for the hover hit area.
    static let interactionPadding: CGFloat = 8
    /// Visible hint lane to the right of the notch in the dormant state.
    static let hoverHintWidth: CGFloat = 26

    /// Built-in display with the camera notch (not necessarily `screens.first`).
    static var notchScreen: NSScreen? {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.screens.first
    }

    static var hasBuiltInNotch: Bool {
        NSScreen.screens.contains { $0.safeAreaInsets.top > 0 }
    }

    // MARK: Island sizes (the visible black shape per phase)

    static func dormantIslandSize(on screen: NSScreen, showRightHint: Bool = true) -> CGSize {
        let metrics = NotchMetrics.current(on: screen)
        let rightHint = showRightHint ? hoverHintWidth : 0
        return CGSize(width: metrics.notchWidth + hoverHintWidth + rightHint, height: metrics.notchHeight)
    }

    static func compactIslandSize(on screen: NSScreen) -> CGSize {
        let metrics = NotchMetrics.current(on: screen)
        return CGSize(width: metrics.notchWidth, height: metrics.notchHeight + compactDrop)
    }

    static func expandedIslandSize(on screen: NSScreen) -> CGSize {
        let metrics = NotchMetrics.current(on: screen)
        let width = max(expandedPanelWidth, metrics.notchWidth)
        return CGSize(width: width, height: metrics.notchHeight + expandedContentHeight)
    }

    // MARK: Window frames per phase

    static func dormantWindowFrame(on screen: NSScreen, showRightHint: Bool = true) -> CGRect {
        let metrics = NotchMetrics.current(on: screen)
        let island = dormantIslandSize(on: screen, showRightHint: showRightHint)
        return CGRect(
            x: metrics.notchCenterX - island.width / 2,
            y: metrics.screenMaxY - island.height,
            width: island.width,
            height: island.height
        )
    }

    static func compactWindowFrame(on screen: NSScreen, showRightHint: Bool = true) -> CGRect {
        let metrics = NotchMetrics.current(on: screen)
        let island = compactIslandSize(on: screen)
        let dormantWidth = dormantIslandSize(on: screen, showRightHint: showRightHint).width
        // Match the dormant width so the hover hit area stays horizontally stable
        // (prevents flicker when revealing the island under the cursor).
        let width = max(island.width + interactionPadding * 2, dormantWidth)
        let height = island.height
        return CGRect(
            x: metrics.notchCenterX - width / 2,
            y: metrics.screenMaxY - height,
            width: width,
            height: height
        )
    }

    static func expandedWindowFrame(on screen: NSScreen) -> CGRect {
        let metrics = NotchMetrics.current(on: screen)
        let island = expandedIslandSize(on: screen)
        let height = island.height + interactionPadding
        return CGRect(
            x: metrics.notchCenterX - island.width / 2,
            y: metrics.screenMaxY - height,
            width: island.width,
            height: height
        )
    }

    static func notchPillFrame(on screen: NSScreen) -> CGRect {
        let metrics = NotchMetrics.current(on: screen)
        return CGRect(
            x: metrics.notchOriginX,
            y: metrics.screenMaxY - metrics.notchHeight,
            width: metrics.notchWidth,
            height: metrics.notchHeight
        )
    }

    /// Screen rect of the dormant bitcoin hint to the right of the notch.
    static func notchBitcoinIconFrame(on screen: NSScreen) -> CGRect {
        let metrics = NotchMetrics.current(on: screen)
        let dormant = dormantWindowFrame(on: screen)
        return CGRect(
            x: dormant.minX + metrics.notchWidth + hoverHintWidth,
            y: dormant.minY,
            width: hoverHintWidth,
            height: metrics.notchHeight
        )
    }

    /// Vertical center of the menu bar band (flight path altitude).
    static func menuBarCenterY(on screen: NSScreen) -> CGFloat {
        let metrics = NotchMetrics.current(on: screen)
        return metrics.screenMaxY - metrics.menubarHeight / 2
    }

    /// Icon rect for surface transition, lifted to the menu bar midline.
    static func flightIconRect(atX centerX: CGFloat, on screen: NSScreen, size: CGFloat = 22) -> CGRect {
        let centerY = menuBarCenterY(on: screen)
        return CGRect(
            x: centerX - size / 2,
            y: centerY - size / 2,
            width: size,
            height: size
        )
    }

    static func windowFrame(on screen: NSScreen, phase: NotchPhase, showNotchHintIcon: Bool = true) -> CGRect {
        switch phase {
        case .dormant: return dormantWindowFrame(on: screen, showRightHint: showNotchHintIcon)
        case .compact: return compactWindowFrame(on: screen, showRightHint: showNotchHintIcon)
        case .expanded: return expandedWindowFrame(on: screen)
        }
    }
}
