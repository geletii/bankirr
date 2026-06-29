// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BankirrStatusBarApp",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "BankirrStatusBarApp",
            targets: ["BankirrStatusBarApp"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", from: "1.2.0"),
    ],
    targets: [
        .executableTarget(
            name: "BankirrStatusBarApp",
            dependencies: [
                "MenuBarExtraAccess",
            ],
            path: "Sources/BankirrStatusBarApp",
            resources: [
                .copy("AppIcon.png"),
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "Resources/Info.plist",
                ]),
            ]
        )
    ]
)
