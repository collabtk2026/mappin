import SwiftUI

/// 호흡법 설명: 방법, 효과, 주의, 출처
struct PatternDetailView: View {
    enum Action { case start, select, edit, duplicate, delete }

    let pattern: BreathingPattern
    let onAction: (Action) -> Void

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    var body: some View {
        ZStack {
            ThemedBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero
                    if !pattern.summary.isEmpty {
                        Text(pattern.summary)
                            .font(.body)
                            .foregroundStyle(.white.opacity(0.85))
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if !pattern.benefits.isEmpty { benefits }
                    if !pattern.howTo.isEmpty { steps }
                    if let caution = pattern.caution { cautionBox(caution) }
                    if let source = pattern.source {
                        Label(source, systemImage: "book.closed")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    actions
                }
                .padding(.horizontal, 22)
                .padding(.top, 28)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white.opacity(0.8))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.white.opacity(0.12)))
            }
            .accessibilityLabel("닫기")
            .padding(16)
        }
        .confirmationDialog("‘\(pattern.name)’을 삭제할까요?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) { onAction(.delete) }
            Button("취소", role: .cancel) {}
        }
    }

    private var hero: some View {
        VStack(spacing: 18) {
            OrbPreview(pattern: pattern, showsRing: true)
                .frame(width: 200, height: 200)
                .frame(maxWidth: .infinity)
            VStack(spacing: 8) {
                Tag(text: pattern.category.title, symbol: pattern.category.symbol, color: pattern.category.tint(theme))
                Text(pattern.name)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                if !pattern.subtitle.isEmpty {
                    Text(pattern.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                }
            }
            PhaseSequenceView(phases: pattern.activePhases)
            HStack(spacing: 12) {
                infoPill("\(pattern.cycleDuration.secondsText)초", "한 번 호흡")
                infoPill(String(format: "%.1f회", pattern.breathsPerMinute), "1분에")
                infoPill(pattern.recommendedCycles.map { "\($0)회" } ?? "\(pattern.recommendedMinutes)분", "권장")
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func infoPill(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .foregroundStyle(.white)
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .glassCard(cornerRadius: 16)
        .accessibilityElement(children: .combine)
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "이럴 때 좋아요")
            ForEach(pattern.benefits, id: \.self) { item in
                Label {
                    Text(item).foregroundStyle(.white.opacity(0.85))
                } icon: {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(theme.accent)
                }
                .font(.subheadline)
            }
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "하는 방법")
            ForEach(Array(pattern.howTo.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(theme.ink)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(theme.orb[0]))
                    Text(step)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 22)
    }

    private func cautionBox(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color(hex: 0xFFC46B))
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 18, tint: Color(hex: 0xFFC46B))
    }

    private var actions: some View {
        VStack(spacing: 12) {
            Button {
                onAction(.start)
            } label: {
                Label("이 호흡으로 시작", systemImage: "play.fill")
            }
            .buttonStyle(PrimaryButtonStyle())

            Button {
                onAction(.select)
            } label: {
                Label("기본 호흡으로 선택", systemImage: "checkmark")
            }
            .buttonStyle(SecondaryButtonStyle())

            if pattern.isBuiltIn {
                if pattern.isSimpleFourStep {
                    Button {
                        onAction(.duplicate)
                    } label: {
                        Label("복사해서 초 바꾸기", systemImage: "square.on.square")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            } else {
                HStack(spacing: 12) {
                    Button {
                        onAction(.edit)
                    } label: {
                        Label("편집", systemImage: "slider.horizontal.3")
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        Label("삭제", systemImage: "trash")
                            .foregroundStyle(Color(hex: 0xFF8A8A))
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
        }
        .padding(.top, 8)
    }
}
