import Darwin
import CoreGraphics

/// Fallback notch dimensions when `auxiliaryTopLeftArea` / `auxiliaryTopRightArea` are unavailable.
enum NotchModelCatalog {
    struct Fallback {
        let wingWidth: CGFloat
        let notchWidth: CGFloat
        let notchHeight: CGFloat
    }

    static func hardwareModel() -> String {
        var size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        var model = [CChar](repeating: 0, count: max(size, 1))
        sysctlbyname("hw.model", &model, &size, nil, 0)
        return String(cString: model)
    }

    static func fallback(for model: String) -> Fallback {
        // Last-resort defaults only when system notch geometry is unavailable/invalid.
        switch model {
        case "MacBookPro18,3", "MacBookPro18,4", "Mac15,3", "Mac15,4", "Mac16,1", "Mac16,6":
            return Fallback(wingWidth: 26, notchWidth: 220, notchHeight: 32)
        case "MacBookPro18,1", "MacBookPro18,2", "Mac15,7", "Mac15,8", "Mac16,5", "Mac16,8":
            return Fallback(wingWidth: 28, notchWidth: 220, notchHeight: 32)
        case "Mac14,2", "Mac14,7", "Mac14,8":
            return Fallback(wingWidth: 24, notchWidth: 200, notchHeight: 32)
        case "Mac14,15":
            return Fallback(wingWidth: 26, notchWidth: 220, notchHeight: 32)
        default:
            if model.hasPrefix("Mac") {
                return Fallback(wingWidth: 26, notchWidth: 220, notchHeight: 32)
            }
            return Fallback(wingWidth: 24, notchWidth: 220, notchHeight: 32)
        }
    }
}
