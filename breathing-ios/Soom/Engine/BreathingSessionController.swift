import AVFoundation
import Foundation
import Observation
import UIKit

/// 하나의 호흡 세션을 진행한다: 준비 카운트다운 → 진행 ↔ 일시정지 → 완료.
/// 시간은 Date 기준으로 계산하므로 화면 갱신이 늦어져도 리듬이 밀리지 않는다.
@MainActor
@Observable
final class BreathingSessionController {
    enum State: Equatable {
        case ready, countdown, running, paused, finished
    }

    static let countdownSeconds = 3
    /// 이보다 짧게 끝낸 세션은 기록하지 않는다
    static let minimumRecordedSeconds: TimeInterval = 10

    let pattern: BreathingPattern
    let timeline: SessionTimeline

    private(set) var state: State = .ready
    private(set) var countdownValue = BreathingSessionController.countdownSeconds
    private(set) var completedNaturally = false
    private(set) var finishedElapsed: TimeInterval = 0
    private(set) var startedAt: Date?

    /// 세션 중에 설정을 바꾸면 즉시 반영된다
    var prefs: Preferences {
        didSet { applyPrefsChange(from: oldValue) }
    }

    @ObservationIgnored private var accumulated: TimeInterval = 0
    @ObservationIgnored private var segmentStart: Date?
    @ObservationIgnored private var countdownStart: Date?
    @ObservationIgnored private var currentKey: PhaseKey?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var audio: AudioCueEngine?
    @ObservationIgnored private var haptics: HapticsEngine?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    init(pattern: BreathingPattern, length: SessionLength, prefs: Preferences) {
        self.pattern = pattern
        self.timeline = SessionTimeline(pattern: pattern, cycles: length.cycleCount(for: pattern))
        self.prefs = prefs
    }

    // MARK: - 시간

    func elapsed(at date: Date = Date()) -> TimeInterval {
        if let segmentStart {
            return accumulated + date.timeIntervalSince(segmentStart)
        }
        return accumulated
    }

    func snapshot(at date: Date) -> BreathSnapshot {
        timeline.snapshot(at: elapsed(at: date))
    }

    /// 다 마친 호흡 횟수
    var completedCycles: Int {
        if completedNaturally, let cycles = timeline.cycles { return cycles }
        guard timeline.cycleDuration > 0 else { return 0 }
        return Int((finishedElapsed / timeline.cycleDuration).rounded(.down))
    }

    var isActive: Bool { state == .countdown || state == .running || state == .paused }

    // MARK: - 진행 제어

    func start() {
        guard state == .ready else { return }
        let haptics = HapticsEngine()
        haptics.prepare()
        self.haptics = haptics
        if prefs.usesAudio { ensureAudio() }
        observeSystemEvents()
        UIApplication.shared.isIdleTimerDisabled = prefs.keepScreenOn

        if prefs.countdownEnabled {
            state = .countdown
            countdownStart = Date()
            countdownValue = Self.countdownSeconds
            cueCountdownTick()
        } else {
            beginRunning()
        }
        startTimer()
    }

    /// 준비 카운트다운을 건너뛰고 바로 시작
    func skipCountdown() {
        guard state == .countdown else { return }
        beginRunning()
    }

    func pause() {
        guard state == .running else { return }
        accumulated = elapsed()
        segmentStart = nil
        state = .paused
        haptics?.stopContinuous()
        audio?.stopSpeaking()
    }

    func resume() {
        guard state == .paused else { return }
        segmentStart = Date()
        state = .running
        let snap = snapshot(at: Date())
        currentKey = snap.phaseKey
        haptics?.phaseBegan(snap.phase.kind, duration: snap.phaseRemaining, mode: prefs.hapticMode)
        if prefs.voiceMode != .off {
            audio?.speak(snap.phase.spoken, volume: Float(prefs.cueVolume))
        }
    }

    func togglePause() {
        switch state {
        case .running: pause()
        case .paused: resume()
        case .countdown: skipCountdown()
        default: break
        }
    }

    /// 세션을 마친다. natural이 false면 사용자가 중간에 끝낸 것.
    func finish(natural: Bool) {
        guard isActive else { return }
        let total = timeline.totalDuration
        finishedElapsed = state == .countdown ? 0 : min(elapsed(), total)
        accumulated = finishedElapsed
        segmentStart = nil
        completedNaturally = natural
        state = .finished
        stopTimer()
        haptics?.stopContinuous()
        UIApplication.shared.isIdleTimerDisabled = false
        removeObservers()

        if natural {
            haptics?.success()
            if prefs.chimeEnabled { audio?.play(.finish) }
            if prefs.voiceMode != .off { audio?.speak("수고하셨어요", volume: Float(prefs.cueVolume)) }
            audio?.fadeOutAndStop(after: 4)
        } else {
            audio?.fadeOutAndStop(after: 0.8)
        }
    }

    /// 화면을 닫을 때 모든 것을 정리한다. 여러 번 불러도 안전하다.
    func tearDown() {
        stopTimer()
        removeObservers()
        haptics?.shutdown()
        if state != .finished {
            audio?.stopNow()
            state = .finished
        }
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func makeRecord() -> SessionRecord? {
        guard state == .finished, finishedElapsed >= Self.minimumRecordedSeconds, let startedAt else { return nil }
        return SessionRecord(
            patternID: pattern.id,
            patternName: pattern.name,
            rhythmText: pattern.rhythmText,
            startDate: startedAt,
            duration: finishedElapsed,
            cycles: completedCycles,
            completed: completedNaturally
        )
    }

    // MARK: - 내부

    private func beginRunning() {
        state = .running
        startedAt = Date()
        accumulated = 0
        segmentStart = Date()
        currentKey = nil
        tick()
    }

    private func startTimer() {
        stopTimer()
        let t = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self else {
                    timer.invalidate()
                    return
                }
                self.tick()
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        let now = Date()
        switch state {
        case .countdown:
            guard let countdownStart else { return }
            let remaining = Self.countdownSeconds - Int(now.timeIntervalSince(countdownStart))
            if remaining <= 0 {
                beginRunning()
            } else if remaining != countdownValue {
                countdownValue = remaining
                cueCountdownTick()
            }
        case .running:
            let snap = snapshot(at: now)
            if snap.isComplete {
                finish(natural: true)
                return
            }
            if snap.phaseKey != currentKey {
                currentKey = snap.phaseKey
                cuePhase(snap)
            }
        default:
            break
        }
    }

    private func cuePhase(_ snap: BreathSnapshot) {
        let phase = snap.phase
        let isTopUp = phase.kind == .inhale && phase.customInstruction != nil
        haptics?.phaseBegan(phase.kind, duration: phase.duration, mode: prefs.hapticMode, isTopUp: isTopUp)

        if prefs.chimeEnabled {
            let cue: AudioCueEngine.Cue
            switch phase.kind {
            case .inhale: cue = isTopUp ? .topUp : .inhale
            case .exhale: cue = .exhale
            case .holdIn, .holdOut: cue = .hold
            }
            audio?.play(cue)
        }

        let speaks = prefs.voiceMode.shouldSpeak(cycle: snap.cycleIndex)
        if speaks {
            audio?.speak(phase.spoken, volume: Float(prefs.cueVolume))
        } else if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: phase.instruction)
        }
    }

    private func cueCountdownTick() {
        if prefs.hapticMode != .off { haptics?.countdownTick() }
        if prefs.chimeEnabled { audio?.play(.tick) }
    }

    private func ensureAudio() {
        let engine = audio ?? AudioCueEngine()
        audio = engine
        engine.cueVolume = Float(prefs.cueVolume)
        engine.start()
        engine.setAmbient(prefs.ambient, volume: Float(prefs.ambientVolume))
    }

    private func applyPrefsChange(from old: Preferences) {
        guard isActive else { return }
        if prefs.usesAudio && audio == nil {
            ensureAudio()
        }
        audio?.cueVolume = Float(prefs.cueVolume)
        if prefs.ambient != old.ambient || prefs.ambientVolume != old.ambientVolume {
            audio?.setAmbient(prefs.ambient, volume: Float(prefs.ambientVolume))
        }
        if prefs.hapticMode == .off {
            haptics?.stopContinuous()
        }
        if prefs.voiceMode == .off {
            audio?.stopSpeaking()
        }
        if prefs.keepScreenOn != old.keepScreenOn {
            UIApplication.shared.isIdleTimerDisabled = prefs.keepScreenOn
        }
    }

    private func observeSystemEvents() {
        removeObservers()
        let center = NotificationCenter.default

        // 전화 등으로 소리가 끊기면 일시정지
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            MainActor.assumeIsolated { self?.pause() }
        })

        // 소리 안내가 없으면 앱이 백그라운드에서 멈추므로 일시정지해 둔다.
        // 소리 안내가 있으면 잠금 화면에서도 계속 진행된다.
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if !self.prefs.usesAudio {
                    self.pause()
                }
            }
        })

        observers.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.haptics?.prepare()
                if self.prefs.usesAudio { self.audio?.start() }
                if self.state == .running || self.state == .paused {
                    UIApplication.shared.isIdleTimerDisabled = self.prefs.keepScreenOn
                }
            }
        })
    }

    private func removeObservers() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
    }
}
