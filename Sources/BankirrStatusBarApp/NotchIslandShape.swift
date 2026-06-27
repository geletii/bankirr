import SwiftUI

/// Solid cap that hugs the notch with slight side extension and rounded bottom.
struct NotchIslandWrapShape: Shape {
    var bottomCornerRadius: CGFloat = 11

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let r = min(bottomCornerRadius, rect.width * 0.08, rect.height * 0.45)

        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - r, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - r),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.closeSubpath()
        return path
    }
}
