import CoreHaptics
import UIKit

/// 탭틱 엔진으로 호흡 리듬을 몸으로 느끼게 한다.
/// '숨결 따라 계속' 모드에서는 들숨에 점점 강해지고 날숨에 점점 약해지는 진동을 낸다.
final class HapticsEngine {
    private var engine: CHHapticEngine?
    private var player: CHHapticAdvancedPatternPlayer?
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    func prepare() {
        guard supportsHaptics, engine == nil else { return }
        do {
            let e = try CHHapticEngine()
            e.playsHapticsOnly = true
            e.isAutoShutdownEnabled = true
            e.resetHandler = { [weak self] in
                try? self?.engine?.start()
            }
            try e.start()
            engine = e
        } catch {
            engine = nil
        }
    }

    /// 단계 시작 시 호출. withTap이 false면 시작 톡 없이 지속 진동만 낸다 (재개할 때).
    func phaseBegan(_ kind: PhaseKind, duration: Double, mode: HapticMode, isTopUp: Bool = false, withTap: Bool = true) {
        stopContinuous()
        guard mode != .off else { return }
        guard let engine else {
            if withTap { fallbackTap(kind) }
            return
        }

        var events: [CHHapticEvent] = []
        var curves: [CHHapticParameterCurve] = []

        if withTap {
            let intensity: Float
            switch kind {
            case .inhale: intensity = isTopUp ? 0.45 : 0.75
            case .exhale: intensity = 0.55
            case .holdIn, .holdOut: intensity = 0.3
            }
            events.append(CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: kind.isHold ? 0.15 : 0.4),
                ],
                relativeTime: 0
            ))
        }

        if mode == .continuous, !kind.isHold, duration > 0.4 {
            let length = min(duration, 30) - 0.1
            events.append(CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.05),
                ],
                relativeTime: 0.08,
                duration: length
            ))
            let from: Float = kind == .inhale ? 0.06 : 0.42
            let to: Float = kind == .inhale ? 0.45 : 0.03
            curves.append(CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: from),
                    CHHapticParameterCurve.ControlPoint(relativeTime: length, value: to),
                ],
                relativeTime: 0.08
            ))
        }

        guard !events.isEmpty else { return }
        do {
            let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
            let p = try engine.makeAdvancedPlayer(with: pattern)
            try engine.start()
            try p.start(atTime: CHHapticTimeImmediate)
            player = p
        } catch {
            if withTap { fallbackTap(kind) }
        }
    }

    func countdownTick() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6)
    }

    func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    func stopContinuous() {
        try? player?.stop(atTime: CHHapticTimeImmediate)
        player = nil
    }

    func shutdown() {
        stopContinuous()
        engine?.stop(completionHandler: nil)
        engine = nil
    }

    private func fallbackTap(_ kind: PhaseKind) {
        let style: UIImpactFeedbackGenerator.FeedbackStyle
        switch kind {
        case .inhale: style = .medium
        case .exhale: style = .soft
        case .holdIn, .holdOut: style = .light
        }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}
