import SwiftUI

/// 전체 화면 호흡 세션
struct SessionView: View {
    let request: SessionRequest

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @Environment(SettingsStore.self) private var settings
    @Environment(HistoryStore.self) private var history
    @Environment(AppRouter.self) private var router

    @State private var controller: BreathingSessionController
    @State private var savedRecord: SessionRecord?
    @State private var showEndDialog = false
    @State private var resumeAfterDialog = false
    @State private var showSoundSheet = false

    init(request: SessionRequest, prefs: Preferences) {
        self.request = request
        _controller = State(initialValue: BreathingSessionController(pattern: request.pattern, length: request.length, prefs: prefs))
    }

    var body: some View {
        ZStack {
            ThemedBackground()

            if controller.state == .finished {
                SessionSummaryView(
                    pattern: controller.pattern,
                    record: savedRecord,
                    completed: controller.completedNaturally,
                    elapsed: controller.finishedElapsed,
                    cycles: controller.completedCycles,
                    healthSynced: settings.prefs.healthSyncEnabled && savedRecord != nil,
                    onMood: { mood in
                        if let id = savedRecord?.id { history.setMood(mood, for: id) }
                    },
                    onDone: { dismiss() },
                    onAgain: { router.start(request.pattern, length: request.length) }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            } else {
                session
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.5), value: controller.state == .finished)
        .onAppear { controller.start() }
        .onDisappear { controller.tearDown() }
        .onChange(of: controller.state) { _, newState in
            if newState == .finished { saveRecord() }
        }
        .onChange(of: settings.prefs) { _, newPrefs in
            controller.prefs = newPrefs
        }
        .statusBarHidden(controller.state == .running)
        .persistentSystemOverlays(controller.state == .running ? .hidden : .automatic)
        .confirmationDialog("세션을 끝낼까요?", isPresented: $showEndDialog, titleVisibility: .visible) {
            Button("끝내고 기록하기") { controller.finish(natural: false) }
            Button("기록하지 않고 나가기", role: .destructive) {
                controller.tearDown()
                dismiss()
            }
            Button("계속하기", role: .cancel) {
                if resumeAfterDialog { controller.resume() }
            }
        }
        .sheet(isPresented: $showSoundSheet) {
            SessionSoundSheet()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - 진행 화면

    private var session: some View {
        TimelineView(.animation(minimumInterval: nil, paused: controller.state == .paused || controller.state == .ready)) { context in
            let snap = controller.snapshot(at: context.date)
            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 12)
                orb(snap, time: context.date.timeIntervalSinceReferenceDate)
                Spacer(minLength: 12)
                instruction(snap)
                    .padding(.bottom, 20)
                PhaseSequenceView(phases: controller.timeline.phases,
                                  currentIndex: controller.state == .countdown ? nil : snap.phaseIndex,
                                  compact: true)
                    .padding(.bottom, 28)
                progress(snap)
                    .padding(.bottom, 24)
                controls
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
    }

    private var topBar: some View {
        HStack {
            CircleIconButton(systemName: "xmark", size: 44, label: "끝내기") { requestEnd() }
            Spacer()
            VStack(spacing: 2) {
                Text(controller.pattern.name)
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(controller.pattern.rhythmText + "초")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
            Spacer()
            CircleIconButton(systemName: soundIcon, size: 44, label: "소리와 진동 설정") { showSoundSheet = true }
        }
        .padding(.top, 8)
    }

    private var soundIcon: String {
        settings.prefs.usesAudio ? "speaker.wave.2.fill" : (settings.prefs.hapticMode == .off ? "speaker.slash.fill" : "iphone.radiowaves.left.and.right")
    }

    private func orb(_ snap: BreathSnapshot, time: TimeInterval) -> some View {
        let isCountdown = controller.state == .countdown
        return ZStack {
            BreathingOrb(level: isCountdown ? 0 : snap.level,
                         progress: isCountdown ? 0 : snap.phaseProgress,
                         time: time)

            Group {
                if isCountdown {
                    Text("\(controller.countdownValue)")
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: controller.countdownValue)
                } else if controller.state == .paused {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 40, weight: .semibold))
                } else {
                    Text("\(snap.countdownValue)")
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: snap.countdownValue)
                }
            }
            .font(.system(size: 54, weight: .light, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(theme.ink.opacity(0.8))
        }
        .frame(maxWidth: 360)
        .contentShape(Circle())
        .onTapGesture { controller.togglePause() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityOrbLabel(snap))
        .accessibilityHint(controller.state == .countdown ? "두 번 탭하면 바로 시작합니다" : "두 번 탭하면 일시정지하거나 다시 시작합니다")
        .accessibilityAddTraits(.isButton)
    }

    private func accessibilityOrbLabel(_ snap: BreathSnapshot) -> String {
        switch controller.state {
        case .countdown: return "준비하세요, \(controller.countdownValue)"
        case .paused: return "일시정지됨"
        default: return "\(snap.phase.instruction), \(snap.countdownValue)초"
        }
    }

    private func instruction(_ snap: BreathSnapshot) -> some View {
        let text: String
        let sub: String
        switch controller.state {
        case .countdown:
            text = "준비하세요"
            sub = "편하게 앉아 어깨에 힘을 빼세요 · 탭하면 바로 시작"
        case .paused:
            text = "잠시 멈춤"
            sub = "구슬을 누르면 이어서 합니다"
        default:
            text = snap.phase.instruction
            sub = snap.phase.kind.title
        }
        return VStack(spacing: 6) {
            Text(text)
                .font(.system(size: 32, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .contentTransition(.opacity)
                .animation(.easeInOut(duration: 0.35), value: text)
            Text(sub)
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)
        }
        .frame(minHeight: 70)
        .accessibilityHidden(true)
    }

    private func progress(_ snap: BreathSnapshot) -> some View {
        let timeline = controller.timeline
        let isCountdown = controller.state == .countdown
        return VStack(spacing: 8) {
            if let total = snap.totalProgress, let cycles = timeline.cycles {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.12))
                        Capsule()
                            .fill(LinearGradient(colors: [theme.orb[0], theme.orb[1]], startPoint: .leading, endPoint: .trailing))
                            .frame(width: max(6, geo.size.width * (isCountdown ? 0 : total)))
                    }
                }
                .frame(height: 6)

                HStack {
                    Text("\(isCountdown ? 0 : min(snap.cycleIndex + 1, cycles)) / \(cycles)회")
                    Spacer()
                    Text("남은 시간 \((isCountdown ? timeline.totalDuration : timeline.totalDuration - snap.totalElapsed).clockText)")
                }
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(.white.opacity(0.65))
            } else {
                HStack {
                    Text("\(isCountdown ? 0 : snap.cycleIndex + 1)회째")
                    Spacer()
                    Text("경과 \((isCountdown ? 0 : snap.totalElapsed).clockText)")
                }
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(.white.opacity(0.65))
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var controls: some View {
        HStack(spacing: 36) {
            CircleIconButton(systemName: "stop.fill", size: 56, label: "끝내기") { requestEnd() }
            CircleIconButton(systemName: controller.state == .paused ? "play.fill" : (controller.state == .countdown ? "forward.fill" : "pause.fill"),
                             size: 80, prominent: true,
                             label: controller.state == .paused ? "다시 시작" : (controller.state == .countdown ? "바로 시작" : "일시정지")) {
                controller.togglePause()
            }
            CircleIconButton(systemName: "slider.horizontal.3", size: 56, label: "소리와 진동 설정") { showSoundSheet = true }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: controller.state)
    }

    // MARK: - 동작

    private func requestEnd() {
        // 아직 거의 진행하지 않았으면 묻지 않고 닫는다
        if controller.state == .countdown || controller.elapsed() < BreathingSessionController.minimumRecordedSeconds {
            controller.tearDown()
            dismiss()
            return
        }
        resumeAfterDialog = controller.state == .running
        controller.pause()
        showEndDialog = true
    }

    private func saveRecord() {
        guard savedRecord == nil, let record = controller.makeRecord() else { return }
        history.add(record)
        savedRecord = record
        if settings.prefs.healthSyncEnabled {
            Task { await HealthKitManager.shared.saveMindfulSession(start: record.startDate, end: record.endDate) }
        }
    }
}

/// 세션 중에 바로 바꾸는 소리·진동 설정
struct SessionSoundSheet: View {
    @Environment(SettingsStore.self) private var settings
    @Environment(\.theme) private var theme

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section("안내") {
                    Picker("음성 안내", selection: $settings.prefs.voiceMode) {
                        ForEach(VoiceMode.allCases) { Text($0.title).tag($0) }
                    }
                    Toggle("신호음", isOn: $settings.prefs.chimeEnabled)
                    Picker("진동", selection: $settings.prefs.hapticMode) {
                        ForEach(HapticMode.allCases) { Text($0.title).tag($0) }
                    }
                    VolumeSlider(value: $settings.prefs.cueVolume, label: "안내 음량")
                }
                Section("배경 소리") {
                    AmbientPicker(selection: $settings.prefs.ambient)
                    if settings.prefs.ambient != .none {
                        VolumeSlider(value: $settings.prefs.ambientVolume, label: "배경 음량")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: theme.background, startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            .navigationTitle("소리와 진동")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
