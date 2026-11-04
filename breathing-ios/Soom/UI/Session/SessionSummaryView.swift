import SwiftUI

/// 세션을 마친 뒤: 결과와 기분 기록
struct SessionSummaryView: View {
    let pattern: BreathingPattern
    let record: SessionRecord?
    let completed: Bool
    let elapsed: TimeInterval
    let cycles: Int
    let healthSynced: Bool
    let onMood: (Mood?) -> Void
    let onDone: () -> Void
    let onAgain: () -> Void

    @Environment(\.theme) private var theme
    @State private var mood: Mood?
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [theme.orb[1].opacity(0.6), .clear], center: .center, startRadius: 0, endRadius: 120))
                    .frame(width: 240, height: 240)
                    .scaleEffect(appeared ? 1 : 0.6)
                Circle()
                    .fill(LinearGradient(colors: [theme.orb[0], theme.orb[1]], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 110, height: 110)
                    .shadow(color: theme.orb[1].opacity(0.6), radius: 30)
                Image(systemName: completed ? "checkmark" : "leaf.fill")
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(theme.ink)
            }
            .accessibilityHidden(true)

            VStack(spacing: 8) {
                Text(completed ? "잘하셨어요" : "여기까지도 충분해요")
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(.white)
                Text(completed ? "몸과 마음이 한결 가벼워졌길 바라요." : "짧은 호흡도 마음을 고르는 데 도움이 돼요.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }

            HStack(spacing: 12) {
                StatTile(value: elapsed.koreanDurationText, label: "호흡한 시간", symbol: "clock", tint: theme.accent)
                StatTile(value: "\(cycles)회", label: "호흡 횟수", symbol: "repeat", tint: theme.accent)
            }

            if record != nil {
                VStack(spacing: 14) {
                    Text("지금 기분은 어떤가요?")
                        .font(.headline)
                        .foregroundStyle(.white)
                    HStack(spacing: 10) {
                        ForEach(Mood.allCases) { item in
                            Button {
                                mood = mood == item ? nil : item
                                onMood(mood)
                            } label: {
                                VStack(spacing: 4) {
                                    Text(item.emoji)
                                        .font(.system(size: 30))
                                    Text(item.label)
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.75))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .fill(.white.opacity(mood == item ? 0.22 : 0.06))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .strokeBorder(theme.orb[0].opacity(mood == item ? 0.7 : 0), lineWidth: 1.5)
                                )
                                .scaleEffect(mood == item ? 1.06 : 1)
                            }
                            .buttonStyle(PressableStyle())
                            .accessibilityLabel(item.label)
                            .accessibilityAddTraits(mood == item ? .isSelected : [])
                        }
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: mood)
                    .sensoryFeedback(.selection, trigger: mood)
                }
                .padding(18)
                .glassCard(cornerRadius: 24)
            }

            if healthSynced {
                Label("건강 앱에 마음챙김 시간으로 기록했어요", systemImage: "heart.fill")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }

            Spacer()

            VStack(spacing: 12) {
                Button("완료", action: onDone)
                    .buttonStyle(PrimaryButtonStyle())
                Button(action: onAgain) {
                    Label("한 번 더 하기", systemImage: "arrow.clockwise")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .onAppear {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.6)) { appeared = true }
        }
    }
}
