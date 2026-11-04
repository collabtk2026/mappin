import Foundation

/// 호흡 한 주기를 이루는 단계의 종류.
enum PhaseKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case inhale     // 들숨
    case holdIn     // 들숨 후 멈춤
    case exhale     // 날숨
    case holdOut    // 날숨 후 멈춤

    var id: String { rawValue }

    /// 편집 화면 등에서 쓰는 이름
    var title: String {
        switch self {
        case .inhale: return "들숨"
        case .holdIn: return "들숨 후 멈춤"
        case .exhale: return "날숨"
        case .holdOut: return "날숨 후 멈춤"
        }
    }

    /// 리듬 표기 등에서 쓰는 짧은 이름
    var shortTitle: String {
        switch self {
        case .inhale: return "들숨"
        case .holdIn, .holdOut: return "멈춤"
        case .exhale: return "날숨"
        }
    }

    /// 세션 화면 가운데 표시되는 안내 문구
    var instruction: String {
        switch self {
        case .inhale: return "들이마시세요"
        case .holdIn: return "멈추세요"
        case .exhale: return "내쉬세요"
        case .holdOut: return "잠시 쉬세요"
        }
    }

    /// 음성 안내 문구
    var spoken: String {
        switch self {
        case .inhale: return "들이마시세요"
        case .holdIn: return "멈추세요"
        case .exhale: return "내쉬세요"
        case .holdOut: return "쉬세요"
        }
    }

    var isHold: Bool { self == .holdIn || self == .holdOut }

    var symbol: String {
        switch self {
        case .inhale: return "arrow.up.circle"
        case .holdIn: return "pause.circle"
        case .exhale: return "arrow.down.circle"
        case .holdOut: return "circle.dotted"
        }
    }
}

/// 호흡의 한 단계 (예: 4초 들숨).
struct BreathPhase: Codable, Hashable, Identifiable, Sendable {
    var id: UUID
    var kind: PhaseKind
    /// 초 단위 길이. 0이면 건너뛴다.
    var duration: Double
    /// 이 단계가 끝났을 때 폐가 찬 정도(0...1). nil이면 종류별 기본값을 쓴다.
    /// 주기적 한숨처럼 두 번 나눠 들이마시는 패턴에 쓴다.
    var targetLevel: Double?
    /// 기본 안내 문구 대신 쓸 문구 (예: "한 번 더")
    var customInstruction: String?

    init(_ kind: PhaseKind, _ duration: Double, targetLevel: Double? = nil, instruction: String? = nil, id: UUID = UUID()) {
        self.id = id
        self.kind = kind
        self.duration = duration
        self.targetLevel = targetLevel
        self.customInstruction = instruction
    }

    var instruction: String { customInstruction ?? kind.instruction }
    var spoken: String { customInstruction ?? kind.spoken }
}

extension Double {
    /// 4 → "4", 5.5 → "5.5"
    var secondsText: String {
        if self.rounded() == self { return String(Int(self)) }
        return String(format: "%.1f", self)
    }
}
