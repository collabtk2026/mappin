// swift-tools-version:5.9
// 앱의 핵심 로직(Soom/Core)만 따로 빌드해 macOS·Linux에서 `swift test`로 검증하기 위한 패키지.
// 앱 자체는 Soom.xcodeproj로 빌드한다.
import PackageDescription

let package = Package(
    name: "SoomCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "SoomCore", targets: ["SoomCore"])],
    targets: [
        .target(name: "SoomCore", path: "Soom/Core"),
        .testTarget(name: "SoomCoreTests", dependencies: ["SoomCore"], path: "Tests/SoomCoreTests"),
    ]
)
