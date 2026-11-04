import Foundation

/// 특정 시점의 호흡 상태
struct BreathSnapshot: Equatable, Sendable {
    /// 0부터 시작하는 주기 번호
    var cycleIndex: Int
    /// 주기 안에서 몇 번째 단계인지
    var phaseIndex: Int
    var phase: BreathPhase
    var phaseElapsed: Double
    var phaseRemaining: Double
    /// 현재 단계 진행률 0...1
    var phaseProgress: Double
    /// 폐가 찬 정도 0...1 (애니메이션용, 부드럽게 보간됨)
    var level: Double
    var totalElapsed: Double
    /// 전체 진행률 0...1. 제한 없는 세션이면 nil
    var totalProgress: Double?
    var isComplete: Bool

    /// 단계가 바뀌었는지 비교할 때 쓰는 키
    var phaseKey: PhaseKey { PhaseKey(cycle: cycleIndex, phase: phaseIndex) }

    /// 화면에 보여줄 남은 초 (올림). 예: 3.2초 남음 → 4
    var countdownValue: Int { max(1, Int(phaseRemaining.rounded(.up))) }
}

struct PhaseKey: Hashable, Sendable {
    var cycle: Int
    var phase: Int
}

/// 패턴과 반복 횟수로 세션 전체 타임라인을 계산한다.
/// 경과 시간만 넣으면 그 순간의 상태를 돌려주는 순수 함수라 테스트하기 쉽다.
struct SessionTimeline: Sendable {
    let phases: [BreathPhase]
    /// nil이면 끝없이 반복
    let cycles: Int?
    let cycleDuration: Double

    private let phaseStarts: [Double]
    private let startLevels: [Double]
    private let endLevels: [Double]

    init(pattern: BreathingPattern, cycles: Int?) {
        let active = pattern.activePhases
        self.phases = active.isEmpty ? [BreathPhase(.inhale, 4), BreathPhase(.exhale, 4)] : active
        self.cycles = cycles.map { max(1, $0) }

        var starts: [Double] = []
        var t = 0.0
        for p in phases {
            starts.append(t)
            t += p.duration
        }
        self.phaseStarts = starts
        self.cycleDuration = t

        // 각 단계가 끝났을 때의 폐 채움 정도
        var ends: [Double] = []
        var level = 0.0
        for p in phases {
            switch p.kind {
            case .inhale: level = p.targetLevel ?? 1
            case .exhale: level = p.targetLevel ?? 0
            case .holdIn, .holdOut: break
            }
            ends.append(min(max(level, 0), 1))
        }
        self.endLevels = ends
        // 각 단계의 시작 값 = 이전 단계의 끝 값 (첫 단계는 주기의 마지막 값에서 이어짐)
        var starts2: [Double] = []
        for i in phases.indices {
            starts2.append(i == 0 ? (ends.last ?? 0) : ends[i - 1])
        }
        self.startLevels = starts2
    }

    /// 전체 길이(초). 제한 없는 세션이면 무한대.
    var totalDuration: Double {
        guard let cycles else { return .infinity }
        return cycleDuration * Double(cycles)
    }

    var isUnlimited: Bool { cycles == nil }

    func snapshot(at elapsedInput: Double) -> BreathSnapshot {
        let elapsed = max(0, elapsedInput)
        let total = totalDuration
        let complete = elapsed >= total

        let t = complete ? total : elapsed
        var cycle = cycleDuration > 0 ? Int(t / cycleDuration) : 0
        var inCycle = t - Double(cycle) * cycleDuration

        // 정확히 끝난 시점이면 마지막 주기의 마지막 순간으로 본다.
        if complete, let cycles {
            cycle = cycles - 1
            inCycle = cycleDuration
        }

        // 현재 단계 찾기
        var index = phases.count - 1
        for i in phases.indices.reversed() where inCycle >= phaseStarts[i] {
            index = i
            break
        }
        // 부동소수점 경계: 단계 끝을 넘으면 다음 단계로
        if !complete, inCycle - phaseStarts[index] >= phases[index].duration, index < phases.count - 1 {
            index += 1
        }

        let phase = phases[index]
        let phaseElapsed = min(max(inCycle - phaseStarts[index], 0), phase.duration)
        let progress = phase.duration > 0 ? phaseElapsed / phase.duration : 1
        let level = Self.interpolate(from: startLevels[index], to: endLevels[index], progress: progress)

        let totalProgress: Double? = total.isFinite && total > 0 ? min(t / total, 1) : nil

        return BreathSnapshot(
            cycleIndex: cycle,
            phaseIndex: index,
            phase: phase,
            phaseElapsed: phaseElapsed,
            phaseRemaining: max(phase.duration - phaseElapsed, 0),
            phaseProgress: progress,
            level: level,
            totalElapsed: t,
            totalProgress: totalProgress,
            isComplete: complete
        )
    }

    /// 들숨·날숨이 자연스럽게 느껴지도록 사인 곡선으로 보간
    static func interpolate(from a: Double, to b: Double, progress: Double) -> Double {
        let p = min(max(progress, 0), 1)
        let eased = 0.5 - 0.5 * cos(Double.pi * p)
        return a + (b - a) * eased
    }
}
