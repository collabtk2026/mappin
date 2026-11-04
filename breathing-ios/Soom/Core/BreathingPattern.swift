import Foundation

/// 호흡법의 목적에 따른 분류
enum PatternCategory: String, Codable, CaseIterable, Identifiable, Sendable {
    case balance, calm, sleep, focus, energy, custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .balance: return "균형"
        case .calm: return "진정"
        case .sleep: return "수면"
        case .focus: return "집중"
        case .energy: return "활력"
        case .custom: return "나의 패턴"
        }
    }

    var symbol: String {
        switch self {
        case .balance: return "circle.lefthalf.filled"
        case .calm: return "leaf"
        case .sleep: return "moon.stars"
        case .focus: return "scope"
        case .energy: return "sun.max"
        case .custom: return "slider.horizontal.3"
        }
    }
}

/// 하나의 호흡법 (예: 박스 호흡 4-4-4-4).
struct BreathingPattern: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var subtitle: String
    var summary: String
    var benefits: [String]
    var howTo: [String]
    var caution: String?
    var source: String?
    var category: PatternCategory
    var symbol: String
    var phases: [BreathPhase]
    var recommendedMinutes: Int
    var recommendedCycles: Int?
    var isBuiltIn: Bool

    init(
        id: String = UUID().uuidString,
        name: String,
        subtitle: String = "",
        summary: String = "",
        benefits: [String] = [],
        howTo: [String] = [],
        caution: String? = nil,
        source: String? = nil,
        category: PatternCategory = .custom,
        symbol: String = "wind",
        phases: [BreathPhase],
        recommendedMinutes: Int = 5,
        recommendedCycles: Int? = nil,
        isBuiltIn: Bool = false
    ) {
        self.id = id
        self.name = name
        self.subtitle = subtitle
        self.summary = summary
        self.benefits = benefits
        self.howTo = howTo
        self.caution = caution
        self.source = source
        self.category = category
        self.symbol = symbol
        self.phases = phases
        self.recommendedMinutes = recommendedMinutes
        self.recommendedCycles = recommendedCycles
        self.isBuiltIn = isBuiltIn
    }

    /// 실제로 진행되는 단계 (0초 단계 제외)
    var activePhases: [BreathPhase] { phases.filter { $0.duration > 0 } }

    /// 한 주기 길이(초)
    var cycleDuration: Double { activePhases.reduce(0) { $0 + $1.duration } }

    /// 분당 호흡 수
    var breathsPerMinute: Double {
        guard cycleDuration > 0 else { return 0 }
        return 60 / cycleDuration
    }

    /// "4 · 7 · 8" 같은 리듬 표기
    var rhythmText: String {
        activePhases.map { $0.duration.secondsText }.joined(separator: " · ")
    }

    /// "들숨 4 · 멈춤 7 · 날숨 8" 같은 자세한 리듬 표기
    var rhythmDetailText: String {
        activePhases.map { "\($0.kind.shortTitle) \($0.duration.secondsText)" }.joined(separator: " · ")
    }

    /// 들숨·멈춤·날숨·멈춤 4칸으로 표현할 수 있는지 (편집기에서 다룰 수 있는지)
    var isSimpleFourStep: Bool {
        let kinds = activePhases.map(\.kind)
        let order: [PhaseKind] = [.inhale, .holdIn, .exhale, .holdOut]
        var cursor = 0
        for kind in kinds {
            guard let idx = order[cursor...].firstIndex(of: kind) else { return false }
            cursor = idx + 1
        }
        return kinds.contains(.inhale) && kinds.contains(.exhale)
    }

    /// 4칸 길이 (편집기용). 해당 단계가 없으면 0.
    var fourStep: FourStepDurations {
        func d(_ k: PhaseKind) -> Double { activePhases.first { $0.kind == k }?.duration ?? 0 }
        return FourStepDurations(inhale: d(.inhale), holdIn: d(.holdIn), exhale: d(.exhale), holdOut: d(.holdOut))
    }

    var isValid: Bool {
        activePhases.contains { $0.kind == .inhale } &&
        activePhases.contains { $0.kind == .exhale } &&
        cycleDuration >= 2
    }
}

/// 편집기에서 쓰는 4칸 리듬
struct FourStepDurations: Hashable, Codable, Sendable {
    var inhale: Double
    var holdIn: Double
    var exhale: Double
    var holdOut: Double

    static let range: ClosedRange<Double> = 1...20
    static let holdRange: ClosedRange<Double> = 0...30

    subscript(kind: PhaseKind) -> Double {
        get {
            switch kind {
            case .inhale: return inhale
            case .holdIn: return holdIn
            case .exhale: return exhale
            case .holdOut: return holdOut
            }
        }
        set {
            let range = kind.isHold ? Self.holdRange : Self.range
            let clamped = min(max(newValue, range.lowerBound), range.upperBound)
            switch kind {
            case .inhale: inhale = clamped
            case .holdIn: holdIn = clamped
            case .exhale: exhale = clamped
            case .holdOut: holdOut = clamped
            }
        }
    }

    var phases: [BreathPhase] {
        PhaseKind.allCases.map { BreathPhase($0, self[$0]) }
    }

    var total: Double { inhale + holdIn + exhale + holdOut }
}

/// 세션 길이를 정하는 방식
enum SessionLength: Codable, Hashable, Sendable {
    case minutes(Int)
    case cycles(Int)
    case unlimited

    static let minuteOptions = [1, 2, 3, 5, 10, 15, 20]
    static let cycleOptions = [4, 8, 10, 15, 20, 30]

    /// 이 패턴으로 몇 번 반복할지. nil이면 제한 없음.
    func cycleCount(for pattern: BreathingPattern) -> Int? {
        switch self {
        case .minutes(let m):
            guard pattern.cycleDuration > 0 else { return 1 }
            return max(1, Int((Double(m) * 60 / pattern.cycleDuration).rounded()))
        case .cycles(let c):
            return max(1, c)
        case .unlimited:
            return nil
        }
    }

    var label: String {
        switch self {
        case .minutes(let m): return "\(m)분"
        case .cycles(let c): return "\(c)회"
        case .unlimited: return "자유롭게"
        }
    }
}

extension TimeInterval {
    /// 125 → "2:05"
    var clockText: String {
        let total = max(0, Int(self.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// 125 → "2분 5초", 40 → "40초", 600 → "10분"
    var koreanDurationText: String {
        let total = max(0, Int(self.rounded()))
        let m = total / 60, s = total % 60
        if m == 0 { return "\(s)초" }
        if s == 0 { return "\(m)분" }
        return "\(m)분 \(s)초"
    }
}
