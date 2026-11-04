import SwiftUI

/// 화면 색 테마. 모두 어두운 바탕 위에 은은하게 빛나는 숨결 구슬을 둔다.
struct Theme: Equatable {
    let id: ThemeID
    /// 배경 그라데이션 (위 → 아래)
    let background: [Color]
    /// 숨결 구슬 그라데이션 (안쪽 밝은 색 → 바깥)
    let orb: [Color]
    let accent: Color

    var title: String { id.title }
    /// 구슬 위 숫자처럼 밝은 바탕에 올리는 글자색
    var ink: Color { background[0] }

    static func of(_ id: ThemeID) -> Theme {
        switch id {
        case .dawn:
            return Theme(id: id,
                         background: [Color(hex: 0x15142E), Color(hex: 0x2E2552), Color(hex: 0x5A3F72)],
                         orb: [Color(hex: 0xFFE3EC), Color(hex: 0xD3B4F2), Color(hex: 0x8C7BE0)],
                         accent: Color(hex: 0xD3B4F2))
        case .ocean:
            return Theme(id: id,
                         background: [Color(hex: 0x041525), Color(hex: 0x0A3350), Color(hex: 0x0D6476)],
                         orb: [Color(hex: 0xE4FCFD), Color(hex: 0x88E1E0), Color(hex: 0x3D8BFF)],
                         accent: Color(hex: 0x88E1E0))
        case .forest:
            return Theme(id: id,
                         background: [Color(hex: 0x09180F), Color(hex: 0x143323), Color(hex: 0x285D45)],
                         orb: [Color(hex: 0xEEF8E2), Color(hex: 0xA3DCB8), Color(hex: 0x4FAE82)],
                         accent: Color(hex: 0xA3DCB8))
        case .sunset:
            return Theme(id: id,
                         background: [Color(hex: 0x1C0D20), Color(hex: 0x4E2340), Color(hex: 0x9A4A4A)],
                         orb: [Color(hex: 0xFFF2D6), Color(hex: 0xFFBC93), Color(hex: 0xF07C82)],
                         accent: Color(hex: 0xFFBC93))
        case .midnight:
            return Theme(id: id,
                         background: [Color(hex: 0x05060B), Color(hex: 0x0E1424), Color(hex: 0x1F2E47)],
                         orb: [Color(hex: 0xF3EEDC), Color(hex: 0xB0BCD8), Color(hex: 0x6F87AE)],
                         accent: Color(hex: 0xB0BCD8))
        }
    }

    static let all: [Theme] = ThemeID.allCases.map(Theme.of)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme.of(.dawn)
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

extension PatternCategory {
    func tint(_ theme: Theme) -> Color {
        switch self {
        case .balance: return theme.accent
        case .calm: return Color(hex: 0x9EE6C9)
        case .sleep: return Color(hex: 0xA9B8FF)
        case .focus: return Color(hex: 0xFFD38A)
        case .energy: return Color(hex: 0xFFA48A)
        case .custom: return Color(hex: 0xF2B8E6)
        }
    }
}
