import SwiftUI

struct EditorTarget: Identifiable {
    let id = UUID()
    var pattern: BreathingPattern
    var isNew: Bool
}

/// 첫 화면: 지금 할 호흡을 고르고 바로 시작한다.
struct HomeView: View {
    @Environment(SettingsStore.self) private var settings
    @Environment(PatternStore.self) private var patterns
    @Environment(HistoryStore.self) private var history
    @Environment(AppRouter.self) private var router
    @Environment(\.theme) private var theme

    @State private var detail: BreathingPattern?
    @State private var editor: EditorTarget?

    private var selected: BreathingPattern {
        patterns.pattern(id: settings.prefs.selectedPatternID) ?? Presets.default
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 28) {
                        header
                        heroCard(proxy: proxy)
                        quickRhythm
                        lengthSection
                        startButton
                        library
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
            .background(ThemedBackground())
            .toolbar(.hidden, for: .navigationBar)
        }
        .sheet(item: $detail) { pattern in
            PatternDetailView(pattern: pattern) { action in
                handle(action, for: pattern)
            }
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editor) { target in
            PatternEditorView(target: target) { saved in
                patterns.upsert(saved)
                settings.prefs.selectedPatternID = saved.id
            }
        }
    }

    // MARK: - 머리말

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text(greeting)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(.white)
                Text(todayText)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.65))
            }
            Spacer()
            if history.streak > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(Color(hex: 0xFFB36B))
                    Text("\(history.streak)일")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .glassCard(cornerRadius: 18)
                .accessibilityLabel("\(history.streak)일 연속 실천 중")
            }
        }
        .padding(.top, 12)
    }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<11: return "좋은 아침이에요"
        case 11..<17: return "잠시 쉬어 갈까요"
        case 17..<21: return "수고 많았어요"
        default: return "편안한 밤 되세요"
        }
    }

    private var todayText: String {
        let minutes = Stats.minutes(history.records, since: Calendar.current.startOfDay(for: Date()))
        if minutes >= 1 {
            return "오늘 \(Int(minutes.rounded()))분 동안 숨을 골랐어요"
        }
        return "숨 한 번에 마음 하나 내려놓기"
    }

    // MARK: - 선택한 호흡

    private func heroCard(proxy: ScrollViewProxy) -> some View {
        let pattern = selected
        return VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Tag(text: pattern.category.title, symbol: pattern.category.symbol, color: pattern.category.tint(theme))
                    Text(pattern.name)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                    Text(pattern.subtitle.isEmpty ? pattern.rhythmDetailText : pattern.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                OrbPreview(pattern: pattern)
                    .frame(width: 92, height: 92)
            }

            PhaseSequenceView(phases: pattern.activePhases)

            HStack(spacing: 10) {
                Label("분당 \(String(format: "%.1f", pattern.breathsPerMinute))회", systemImage: "metronome")
                Text("·").opacity(0.5)
                Label("한 번에 \(pattern.cycleDuration.secondsText)초", systemImage: "repeat")
            }
            .font(.caption)
            .foregroundStyle(.white.opacity(0.6))
            .labelStyle(.titleAndIcon)

            HStack(spacing: 10) {
                Button {
                    withAnimation(.easeInOut) { proxy.scrollTo("library", anchor: .top) }
                } label: {
                    Label("호흡법 바꾸기", systemImage: "square.grid.2x2")
                }
                .buttonStyle(SecondaryButtonStyle())

                Button {
                    detail = pattern
                } label: {
                    Label("알아보기", systemImage: "info.circle")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(20)
        .glassCard(cornerRadius: 28, tint: theme.accent)
    }

    // MARK: - 빠른 리듬 (4·5·6·7·8초)

    private var quickRhythm: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(title: "빠른 리듬", caption: "같은 초만큼 들이마시고 내쉽니다")
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Presets.quickSeconds, id: \.self) { seconds in
                        Chip(title: "\(seconds)초", subtitle: "분당 \(String(format: "%.1f", 30.0 / Double(seconds)))회",
                             isSelected: isQuickSelected(seconds)) {
                            settings.prefs.selectedPatternID = Presets.quickID(seconds)
                        }
                    }
                    Chip(title: "직접 설정", subtitle: "숨 참기 포함", isSelected: false) {
                        editor = EditorTarget(pattern: newPatternTemplate(), isNew: true)
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func isQuickSelected(_ seconds: Int) -> Bool {
        let s = Double(seconds)
        let d = selected.fourStep
        return selected.isSimpleFourStep && d == FourStepDurations(inhale: s, holdIn: 0, exhale: s, holdOut: 0)
    }

    private func newPatternTemplate() -> BreathingPattern {
        let base = selected.isSimpleFourStep ? selected.fourStep : FourStepDurations(inhale: 4, holdIn: 0, exhale: 6, holdOut: 0)
        return BreathingPattern(name: "나의 호흡 \(patterns.custom.count + 1)", subtitle: "", category: .custom,
                                symbol: "sparkles", phases: base.phases)
    }

    // MARK: - 세션 길이

    private enum LengthMode: String, CaseIterable, Identifiable {
        case time = "시간", cycles = "횟수", free = "자유"
        var id: String { rawValue }
    }

    private var lengthMode: LengthMode {
        switch settings.prefs.sessionLength {
        case .minutes: return .time
        case .cycles: return .cycles
        case .unlimited: return .free
        }
    }

    private var lengthSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SectionTitle(title: "얼마나 할까요?", caption: lengthEstimate)
                Spacer()
            }

            Picker("세션 길이 방식", selection: Binding(
                get: { lengthMode },
                set: { mode in
                    switch mode {
                    case .time: settings.prefs.sessionLength = .minutes(3)
                    case .cycles: settings.prefs.sessionLength = .cycles(selected.recommendedCycles ?? 10)
                    case .free: settings.prefs.sessionLength = .unlimited
                    }
                }
            )) {
                ForEach(LengthMode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            switch lengthMode {
            case .time:
                chipRow(SessionLength.minuteOptions.map { SessionLength.minutes($0) })
            case .cycles:
                chipRow(SessionLength.cycleOptions.map { SessionLength.cycles($0) })
            case .free:
                Text("원하는 만큼 하다가 종료 버튼을 누르세요.")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.6))
            }

            if let rec = selected.recommendedCycles, settings.prefs.sessionLength != .cycles(rec) {
                Button {
                    settings.prefs.sessionLength = .cycles(rec)
                } label: {
                    Label("\(selected.name)은 처음에 \(rec)회를 권장해요 · 적용", systemImage: "lightbulb")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(theme.accent)
                }
            }
        }
    }

    private func chipRow(_ options: [SessionLength]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(options, id: \.self) { option in
                    Chip(title: option.label, isSelected: settings.prefs.sessionLength == option) {
                        settings.prefs.sessionLength = option
                    }
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
    }

    private var lengthEstimate: String {
        let p = selected
        switch settings.prefs.sessionLength {
        case .minutes:
            let n = settings.prefs.sessionLength.cycleCount(for: p) ?? 0
            return "\(n)번 숨 쉬어요 · 약 \((Double(n) * p.cycleDuration).koreanDurationText)"
        case .cycles(let c):
            return "약 \((Double(c) * p.cycleDuration).koreanDurationText) 걸려요"
        case .unlimited:
            return "시간 제한 없이"
        }
    }

    // MARK: - 시작

    private var startButton: some View {
        Button {
            router.start(selected, length: settings.prefs.sessionLength)
        } label: {
            Label("시작하기", systemImage: "play.fill")
                .font(.title3.weight(.bold))
        }
        .buttonStyle(PrimaryButtonStyle())
        .sensoryFeedback(.impact(weight: .medium), trigger: router.session?.id)
    }

    // MARK: - 호흡법 모음

    private var library: some View {
        VStack(alignment: .leading, spacing: 24) {
            SectionTitle(title: "목적별 호흡법", caption: "카드를 눌러 방법과 효과를 확인하세요")
                .id("library")

            ForEach([PatternCategory.balance, .calm, .sleep, .focus, .energy]) { category in
                categoryRow(category, items: patterns.patterns(in: category))
            }

            VStack(alignment: .leading, spacing: 12) {
                Label("나의 패턴", systemImage: PatternCategory.custom.symbol)
                    .font(.headline)
                    .foregroundStyle(PatternCategory.custom.tint(theme))
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(patterns.custom) { pattern in
                            PatternCard(pattern: pattern, isSelected: pattern.id == selected.id) { detail = pattern }
                        }
                        Button {
                            editor = EditorTarget(pattern: newPatternTemplate(), isNew: true)
                        } label: {
                            VStack(spacing: 10) {
                                Image(systemName: "plus")
                                    .font(.title2.weight(.semibold))
                                Text("새 패턴 만들기")
                                    .font(.subheadline.weight(.semibold))
                                Text("초를 직접 정해요")
                                    .font(.caption)
                                    .opacity(0.6)
                            }
                            .foregroundStyle(.white)
                            .frame(width: 170, height: 150)
                            .background(
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .strokeBorder(.white.opacity(0.25), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                            )
                        }
                        .buttonStyle(PressableStyle())
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func categoryRow(_ category: PatternCategory, items: [BreathingPattern]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(category.title, systemImage: category.symbol)
                .font(.headline)
                .foregroundStyle(category.tint(theme))
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(items) { pattern in
                        PatternCard(pattern: pattern, isSelected: pattern.id == selected.id) { detail = pattern }
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: - 동작

    private func handle(_ action: PatternDetailView.Action, for pattern: BreathingPattern) {
        switch action {
        case .start:
            settings.prefs.selectedPatternID = pattern.id
            detail = nil
            let length = settings.prefs.sessionLength
            // 시트가 닫힌 다음 세션 화면을 띄운다
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                router.start(pattern, length: length)
            }
        case .select:
            settings.prefs.selectedPatternID = pattern.id
            detail = nil
        case .edit:
            detail = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                editor = EditorTarget(pattern: pattern, isNew: false)
            }
        case .duplicate:
            let copy = patterns.duplicate(pattern)
            detail = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                editor = EditorTarget(pattern: copy, isNew: false)
            }
        case .delete:
            patterns.delete(id: pattern.id)
            if settings.prefs.selectedPatternID == pattern.id {
                settings.prefs.selectedPatternID = Presets.default.id
            }
            detail = nil
        }
    }
}

/// 호흡법 카드 (가로 스크롤)
struct PatternCard: View {
    let pattern: BreathingPattern
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: pattern.symbol)
                        .font(.title3)
                        .foregroundStyle(pattern.category.tint(theme))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(pattern.category.tint(theme).opacity(0.15)))
                    Spacer()
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(theme.orb[0])
                            .accessibilityLabel("선택됨")
                    }
                }
                Spacer(minLength: 0)
                Text(pattern.name)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(pattern.rhythmDetailText)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(width: 170, height: 150, alignment: .leading)
            .glassCard(cornerRadius: 22, tint: isSelected ? theme.accent : nil)
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(theme.orb[0].opacity(isSelected ? 0.6 : 0), lineWidth: 1.5)
            )
        }
        .buttonStyle(PressableStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("자세히 보기")
    }
}
