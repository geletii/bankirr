import SwiftUI

struct DisplaySurfaceToggle: View {
    enum Style {
        case glass
        case prominent
        case compact
    }

    @ObservedObject var coordinator: DisplaySurfaceCoordinator
    var style: Style = .glass

    var body: some View {
        if coordinator.canSwitchSurface {
            Button(action: toggle) {
                Group {
                    if style == .compact {
                        if coordinator.isTransitioning {
                            ProgressView()
                                .controlSize(.mini)
                                .scaleEffect(0.65)
                                .frame(width: 22, height: 22)
                        } else {
                            Image(systemName: iconName)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 22, height: 22)
                                .background(.quaternary.opacity(0.5), in: Circle())
                        }
                    } else {
                        HStack(spacing: 6) {
                            if coordinator.isTransitioning {
                                ProgressView()
                                    .controlSize(.mini)
                                    .scaleEffect(0.7)
                                    .frame(width: 12, height: 12)
                            } else {
                                Image(systemName: iconName)
                                    .font(.system(size: 11, weight: .semibold))
                            }
                            Text(labelText)
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(foreground)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .background(background)
                        .overlay(border)
                        .clipShape(Capsule(style: .continuous))
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(coordinator.isTransitioning)
            .bankirrHelp(labelText)
            .animation(.easeInOut(duration: 0.2), value: coordinator.isTransitioning)
        }
    }

    private var iconName: String {
        coordinator.displayPreference == .notch
            ? "menubar.rectangle"
            : "macbook.gen2"
    }

    private var labelText: String {
        coordinator.displayPreference == .notch
            ? "Move to menu bar"
            : "Move to notch"
    }

    private var foreground: Color {
        switch style {
        case .glass: return .white.opacity(0.92)
        case .prominent, .compact: return .accentColor
        }
    }

    @ViewBuilder
    private var background: some View {
        switch style {
        case .glass:
            Capsule(style: .continuous).fill(.white.opacity(0.12))
        case .prominent, .compact:
            Capsule(style: .continuous).fill(Color.accentColor.opacity(0.12))
        }
    }

    @ViewBuilder
    private var border: some View {
        switch style {
        case .glass:
            Capsule(style: .continuous).stroke(.white.opacity(0.18), lineWidth: 1)
        case .prominent, .compact:
            Capsule(style: .continuous).stroke(Color.accentColor.opacity(0.25), lineWidth: 1)
        }
    }

    private func toggle() {
        if coordinator.displayPreference == .notch {
            coordinator.moveToMenuBar()
        } else {
            coordinator.moveToNotch()
        }
    }
}
