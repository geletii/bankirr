import AppKit
import SwiftUI

enum DisplaySurfaceMorphAnimator {
  private static var window: NSPanel?
  private static var hostingController: NSHostingController<AnyView>?

  private static let iconSize: CGFloat = 22

  @MainActor
  static func animate(from source: CGRect, to destination: CGRect) async {
    await withCheckedContinuation { continuation in
      let startFrame = iconFrame(around: source)
      let endFrame = iconFrame(around: destination)

      let panel = NSPanel(
        contentRect: startFrame,
        styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered,
        defer: false
      )
      panel.isOpaque = false
      panel.backgroundColor = .clear
      panel.hasShadow = false
      panel.level = .statusBar + 1
      panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]

      let icon = AnyView(
        MorphFlyingBitcoinIcon()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      )
      let host = NSHostingController(rootView: icon)
      panel.contentViewController = host
      panel.alphaValue = 0
      panel.orderFrontRegardless()

      window = panel
      hostingController = host

      NSAnimationContext.runAnimationGroup { context in
        context.duration = 0.1
        context.timingFunction = CAMediaTimingFunction(name: .easeOut)
        panel.animator().alphaValue = 1
      }

      NSAnimationContext.runAnimationGroup { context in
        context.duration = 0.46
        context.timingFunction = CAMediaTimingFunction(controlPoints: 0.32, 0.0, 0.16, 1.0)
        panel.animator().setFrame(endFrame, display: true)
      } completionHandler: {
        NSAnimationContext.runAnimationGroup { context in
          context.duration = 0.12
          context.timingFunction = CAMediaTimingFunction(name: .easeIn)
          panel.animator().alphaValue = 0
        } completionHandler: {
          panel.orderOut(nil)
          window = nil
          hostingController = nil
          continuation.resume()
        }
      }
    }
  }

  private static func iconFrame(around rect: CGRect) -> CGRect {
    CGRect(
      x: rect.midX - iconSize / 2,
      y: rect.midY - iconSize / 2,
      width: iconSize,
      height: iconSize
    )
  }
}

private struct MorphFlyingBitcoinIcon: View {
  var body: some View {
    Image(systemName: "bitcoinsign")
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(.white.opacity(0.92))
      .shadow(color: .black.opacity(0.45), radius: 2, y: 1)
  }
}
