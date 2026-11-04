import SwiftUI

/// 나만의 호흡 패턴 만들기: 들숨·멈춤·날숨·멈춤 각각의 초를 정한다.
struct PatternEditorView: View {
    let target: EditorTarget
    let onSave: (BreathingPattern) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name: String
    @State private var durations: FourStepDurations

    init(target: EditorTarget, onSave: @escaping (BreathingPattern) -> Void) {
        self.target = target
        self.onSave = onSave
        _name = State(initialValue: target.pattern.name)
        _durations = State(initialValue: target.pattern.fourStep)
    }

    /// 편집 중인 값으로 만든 패턴 (미리보기와 저장에 사용)
    private var draft: BreathingPattern {
        var p = target.pattern
        p.name = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "나의 호흡" : name
        p.phases = durations.phases
        p.subtitle = p.rhythmDetailText
        p.summary = "직접 만든 호흡 패턴입니다."
        p.benefits = []
        p.howTo = []
        p.caution = nil
        p.source = nil
        p.category = .custom
        p.isBuiltIn = false
        return p
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ThemedBackground()
                ScrollView {
                    VStack(spacing: 22) {
                        preview
                        nameField
                        ForEach(PhaseKind.allCases) { kind in
                            PhaseDurationRow(kind: kind, value: Binding(
                                get: { durations[kind] },
                                set: { durations[kind] = $0 }
                            ))
                        }
                        presets
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(target.isNew ? "새 패턴" : "패턴 편집")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") {
                        onSave(draft)
                        dismiss()
                    }
                    .fontWeight(.bold)
                    .disabled(!draft.isValid)
                }
            }
        }
    }

    private var preview: some View {
        VStack(spacing: 14) {
            OrbPreview(pattern: draft, showsRing: true)
                .frame(width: 170, height: 170)
            PhaseSequenceView(phases: draft.activePhases)
            Text("한 번 호흡 \(durations.total.secondsText)초 · 1분에 \(String(format: "%.1f", draft.breathsPerMinute))회")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.65))
                .monospacedDigit()
        }
        .padding(.top, 8)
    }

    private var nameField: some View {
        HStack {
            Image(systemName: "pencil")
                .foregroundStyle(.white.opacity(0.6))
            TextField("패턴 이름", text: $name)
                .foregroundStyle(.white)
                .submitLabel(.done)
        }
        .padding(16)
        .glassCard(cornerRadius: 18)
    }

    /// 자주 쓰는 리듬을 한 번에 채우기
    private var presets: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "자주 쓰는 리듬으로 채우기")
            let items: [(String, FourStepDurations)] = [
                ("4 · 4", .init(inhale: 4, holdIn: 0, exhale: 4, holdOut: 0)),
                ("6 · 6", .init(inhale: 6, holdIn: 0, exhale: 6, holdOut: 0)),
                ("4 · 6", .init(inhale: 4, holdIn: 0, exhale: 6, holdOut: 0)),
                ("4 · 7 · 8", .init(inhale: 4, holdIn: 7, exhale: 8, holdOut: 0)),
                ("4 · 4 · 4 · 4", .init(inhale: 4, holdIn: 4, exhale: 4, holdOut: 4)),
                ("5 · 5 · 5 · 5", .init(inhale: 5, holdIn: 5, exhale: 5, holdOut: 5)),
                ("7 · 11", .init(inhale: 7, holdIn: 0, exhale: 11, holdOut: 0)),
                ("8 · 8", .init(inhale: 8, holdIn: 0, exhale: 8, holdOut: 0)),
            ]
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
                ForEach(items.indices, id: \.self) { i in
                    Chip(title: items[i].0, isSelected: durations == items[i].1) {
                        withAnimation(.spring(response: 0.35)) { durations = items[i].1 }
                    }
                }
            }
        }
    }
}

/// 한 단계의 초를 정하는 줄: −/+ 버튼과 빠른 선택 칩
struct PhaseDurationRow: View {
    let kind: PhaseKind
    @Binding var value: Double
    @Environment(\.theme) private var theme

    private var range: ClosedRange<Double> { kind.isHold ? FourStepDurations.holdRange : FourStepDurations.range }
    private var quick: [Double] { kind.isHold ? [0, 2, 4, 7] : [3, 4, 5, 6, 7, 8] }

    private var caption: String {
        switch kind {
        case .inhale: return "코로 천천히 들이마시는 시간"
        case .holdIn: return "숨을 머금는 시간 · 0초면 건너뜀"
        case .exhale: return "천천히 내쉬는 시간"
        case .holdOut: return "비운 채 쉬는 시간 · 0초면 건너뜀"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: kind.symbol)
                    .font(.title3)
                    .foregroundStyle(theme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(kind.title)
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.55))
                }
                Spacer()
                stepButton("minus", delta: -0.5)
                Text(value == 0 ? "없음" : "\(value.secondsText)초")
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(value == 0 ? .white.opacity(0.45) : .white)
                    .frame(minWidth: 58)
                    .contentTransition(.numericText(value: value))
                    .animation(.snappy, value: value)
                    .sensoryFeedback(.selection, trigger: value)
                stepButton("plus", delta: 0.5)
            }

            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(quick, id: \.self) { s in
                        Chip(title: s == 0 ? "없음" : "\(s.secondsText)초", isSelected: value == s) {
                            value = s
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
        .padding(16)
        .glassCard(cornerRadius: 22)
        .accessibilityElement(children: .contain)
    }

    private func stepButton(_ symbol: String, delta: Double) -> some View {
        Button {
            adjust(delta)
        } label: {
            Image(systemName: symbol)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(Circle().fill(.white.opacity(0.12)))
        }
        .buttonStyle(PressableStyle())
        .disabled(delta < 0 ? value <= range.lowerBound : value >= range.upperBound)
        .opacity((delta < 0 ? value <= range.lowerBound : value >= range.upperBound) ? 0.35 : 1)
        .accessibilityLabel("\(kind.title) \(delta < 0 ? "줄이기" : "늘리기")")
        .accessibilityValue("\(value.secondsText)초")
    }

    private func adjust(_ delta: Double) {
        value = min(max(value + delta, range.lowerBound), range.upperBound)
    }
}
