import Foundation

/// 기본 제공 호흡법.
/// 널리 쓰이고 연구·임상에서 자주 인용되는 방법들을 목적별로 골랐다.
enum Presets {
    // 고정 UUID — 단계 id가 실행마다 바뀌지 않도록 한다.
    private static func pid(_ n: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", n))!
    }

    static let equal = BreathingPattern(
        id: "builtin.equal",
        name: "균등 호흡",
        subtitle: "들숨과 날숨을 같은 길이로",
        summary: "요가의 사마 브리티(Sama Vritti)에서 온 가장 기본적인 호흡입니다. 들숨과 날숨을 같은 길이로 맞추며 마음을 고르게 합니다. 처음이라면 여기서 시작하세요.",
        benefits: ["호흡 리듬을 익히기 좋은 입문 호흡", "들뜬 마음을 고르게", "언제 어디서나 부담 없이"],
        howTo: ["코로 천천히 들이마십니다.", "같은 길이로 코로 내쉽니다.", "익숙해지면 1초씩 늘려 보세요 (4초 → 6초 → 8초)."],
        source: "요가 호흡법(프라나야마) 사마 브리티",
        category: .balance,
        symbol: "equal.circle",
        phases: [BreathPhase(.inhale, 4, id: pid(101)), BreathPhase(.exhale, 4, id: pid(102))],
        recommendedMinutes: 3,
        isBuiltIn: true
    )

    static let coherent = BreathingPattern(
        id: "builtin.coherent",
        name: "공명 호흡",
        subtitle: "분당 약 5.5회, 심박변이도(HRV)를 높이는 호흡",
        summary: "1분에 5~6번 정도로 천천히 숨 쉬면 심장 박동과 호흡이 한 박자로 맞물리는 '공명' 상태에 가까워집니다. 심박변이도(HRV) 바이오피드백 연구에서 가장 많이 쓰이는 속도입니다.",
        benefits: ["심박변이도(HRV) 향상", "자율신경 균형", "스트레스·불안 완화"],
        howTo: ["코로 5.5초 동안 배가 부풀도록 들이마십니다.", "5.5초 동안 부드럽게 내쉽니다.", "하루 10~20분이면 효과를 보기 좋습니다."],
        source: "Lehrer & Gevirtz (2014), Zaccaro 외 (2018) 느린 호흡 연구 리뷰",
        category: .balance,
        symbol: "waveform.path.ecg",
        phases: [BreathPhase(.inhale, 5.5, id: pid(201)), BreathPhase(.exhale, 5.5, id: pid(202))],
        recommendedMinutes: 10,
        isBuiltIn: true
    )

    static let box = BreathingPattern(
        id: "builtin.box",
        name: "박스 호흡",
        subtitle: "4초씩 네 번, 긴장 속에서도 침착하게",
        summary: "들숨·멈춤·날숨·멈춤을 같은 길이로 반복해 네모를 그리듯 숨 쉽니다. 미 해군 특수부대가 긴박한 상황에서 침착함을 유지하려고 쓰는 방법으로 알려져 있습니다.",
        benefits: ["집중력 회복", "발표·시험 전 긴장 완화", "생각을 정리하고 싶을 때"],
        howTo: ["4초 동안 코로 들이마십니다.", "4초 동안 숨을 참습니다.", "4초 동안 내쉽니다.", "4초 동안 비운 채로 멈춥니다."],
        caution: "숨 참기가 힘들면 멈춤을 2초로 줄여 보세요.",
        source: "Mark Divine, 미 해군 네이비씰 훈련",
        category: .focus,
        symbol: "square",
        phases: [
            BreathPhase(.inhale, 4, id: pid(301)), BreathPhase(.holdIn, 4, id: pid(302)),
            BreathPhase(.exhale, 4, id: pid(303)), BreathPhase(.holdOut, 4, id: pid(304)),
        ],
        recommendedMinutes: 5,
        isBuiltIn: true
    )

    static let triangle = BreathingPattern(
        id: "builtin.triangle",
        name: "삼각 호흡",
        subtitle: "들숨·멈춤·날숨, 박스 호흡보다 가볍게",
        summary: "박스 호흡에서 날숨 뒤 멈춤을 뺀 세 단계 호흡입니다. 숨 참기가 부담스러운 분도 편하게 집중 상태로 들어갈 수 있습니다.",
        benefits: ["가벼운 집중", "업무 사이 짧은 리셋", "박스 호흡 입문"],
        howTo: ["4초 들이마십니다.", "4초 멈춥니다.", "4초 내쉽니다."],
        category: .focus,
        symbol: "triangle",
        phases: [BreathPhase(.inhale, 4, id: pid(401)), BreathPhase(.holdIn, 4, id: pid(402)), BreathPhase(.exhale, 4, id: pid(403))],
        recommendedMinutes: 3,
        isBuiltIn: true
    )

    static let fourSevenEight = BreathingPattern(
        id: "builtin.478",
        name: "4-7-8 호흡",
        subtitle: "잠들기 전, 몸을 깊이 이완시키는 호흡",
        summary: "앤드루 웨일 박사가 소개해 널리 알려진 호흡법입니다. 4초 들이마시고 7초 참은 뒤 8초에 걸쳐 길게 내쉽니다. 긴 날숨이 부교감신경을 깨워 몸을 쉬는 상태로 이끕니다.",
        benefits: ["잠들기 쉽게", "불안할 때 빠르게 진정", "몸의 긴장 풀기"],
        howTo: ["혀끝을 윗니 뒤 잇몸에 댑니다.", "입을 다물고 코로 4초 들이마십니다.", "7초 동안 숨을 참습니다.", "입으로 '후—' 소리를 내며 8초 동안 내쉽니다.", "처음에는 4회만, 익숙해지면 8회까지 늘리세요."],
        caution: "처음에는 어지러울 수 있습니다. 4회부터 시작하고, 앉거나 누운 자세로 하세요.",
        source: "Andrew Weil, M.D.",
        category: .sleep,
        symbol: "moon.zzz",
        phases: [BreathPhase(.inhale, 4, id: pid(501)), BreathPhase(.holdIn, 7, id: pid(502)), BreathPhase(.exhale, 8, id: pid(503))],
        recommendedMinutes: 2,
        recommendedCycles: 4,
        isBuiltIn: true
    )

    static let deepRest = BreathingPattern(
        id: "builtin.deeprest",
        name: "깊은 이완",
        subtitle: "날숨을 들숨의 두 배로 (1:2)",
        summary: "날숨을 들숨보다 두 배 길게 하면 심박이 자연스럽게 느려집니다. 숨을 참지 않아 4-7-8보다 편안하며, 잠자리에서 하기 좋습니다.",
        benefits: ["심박을 천천히", "잠자리 루틴", "숨 참기 없이 깊은 휴식"],
        howTo: ["코로 4초 들이마십니다.", "입이나 코로 8초 동안 천천히 내쉽니다.", "내쉴 때 어깨와 턱의 힘을 빼세요."],
        category: .sleep,
        symbol: "bed.double",
        phases: [BreathPhase(.inhale, 4, id: pid(601)), BreathPhase(.exhale, 8, id: pid(602))],
        recommendedMinutes: 10,
        isBuiltIn: true
    )

    static let cyclicSigh = BreathingPattern(
        id: "builtin.sigh",
        name: "주기적 한숨",
        subtitle: "두 번 들이마시고 길게 내쉬기",
        summary: "코로 한 번 깊게, 이어서 한 번 더 짧게 들이마셔 폐를 가득 채운 뒤 입으로 길게 내쉽니다. 스탠퍼드 연구에서 하루 5분 실천으로 마음챙김 명상보다 기분 개선 효과가 컸던 방법입니다.",
        benefits: ["가장 빠른 진정 효과", "기분 개선", "하루 5분이면 충분"],
        howTo: ["코로 깊게 들이마십니다.", "멈추지 말고 코로 한 번 더 짧게 들이마십니다.", "입으로 천천히, 끝까지 내쉽니다."],
        source: "Balban 외 (2023), Cell Reports Medicine, 스탠퍼드 의대",
        category: .calm,
        symbol: "wind",
        phases: [
            BreathPhase(.inhale, 2.5, targetLevel: 0.75, id: pid(701)),
            BreathPhase(.inhale, 1, targetLevel: 1, instruction: "한 번 더", id: pid(702)),
            BreathPhase(.exhale, 6, id: pid(703)),
        ],
        recommendedMinutes: 5,
        isBuiltIn: true
    )

    static let relax = BreathingPattern(
        id: "builtin.relax",
        name: "이완 호흡",
        subtitle: "날숨을 조금 더 길게, 스트레스 낮추기",
        summary: "날숨을 들숨보다 살짝 길게 하는 것만으로도 몸이 쉬는 모드로 바뀝니다. 업무 중이나 화가 날 때 부담 없이 할 수 있는 호흡입니다.",
        benefits: ["스트레스 완화", "화나거나 초조할 때", "일상 속 짧은 휴식"],
        howTo: ["코로 4초 들이마십니다.", "6초 동안 천천히 내쉽니다."],
        category: .calm,
        symbol: "leaf",
        phases: [BreathPhase(.inhale, 4, id: pid(801)), BreathPhase(.exhale, 6, id: pid(802))],
        recommendedMinutes: 5,
        isBuiltIn: true
    )

    static let energize = BreathingPattern(
        id: "builtin.energize",
        name: "활력 호흡",
        subtitle: "들숨을 길게, 날숨은 짧게 깨우기",
        summary: "들숨을 날숨보다 길게 하면 교감신경이 살짝 활성화되어 정신이 맑아집니다. 오후에 나른할 때나 운동 전에 좋습니다.",
        benefits: ["졸음 깨기", "운동 전 준비", "아침을 상쾌하게"],
        howTo: ["코로 힘 있게 4초 들이마십니다.", "2초 동안 가볍게 내쉽니다."],
        caution: "어지러우면 바로 멈추고 평소 호흡으로 돌아가세요. 1~2분이면 충분합니다.",
        category: .energy,
        symbol: "bolt",
        phases: [BreathPhase(.inhale, 4, id: pid(901)), BreathPhase(.exhale, 2, id: pid(902))],
        recommendedMinutes: 1,
        isBuiltIn: true
    )

    static let all: [BreathingPattern] = [
        equal, coherent, cyclicSigh, relax, box, triangle, fourSevenEight, deepRest, energize,
    ]

    static let `default` = equal

    /// 홈 화면 '빠른 리듬'에서 고를 수 있는 초
    static let quickSeconds: [Int] = [4, 5, 6, 7, 8]

    /// 들숨·날숨을 같은 초로 맞춘 균등 호흡 (예: 6초 들숨 · 6초 날숨)
    static func equal(seconds: Int) -> BreathingPattern {
        var p = equal
        p.id = quickID(seconds)
        p.name = "균등 호흡 \(seconds)초"
        p.phases = [BreathPhase(.inhale, Double(seconds), id: pid(1000 + seconds)),
                    BreathPhase(.exhale, Double(seconds), id: pid(1100 + seconds))]
        return p
    }

    static func quickID(_ seconds: Int) -> String { "quick.equal.\(seconds)" }

    /// "quick.equal.6" → 6
    static func quickSeconds(from id: String) -> Int? {
        guard id.hasPrefix("quick.equal.") else { return nil }
        return Int(id.dropFirst("quick.equal.".count))
    }

    static func builtIn(id: String) -> BreathingPattern? {
        if id == equal.id { return equal }
        if let s = quickSeconds(from: id), (1...20).contains(s) { return equal(seconds: s) }
        return all.first { $0.id == id }
    }
}
