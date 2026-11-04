import SwiftUI

// MARK: - 배경

/// 테마 그라데이션 위로 흐릿한 빛이 천천히 떠다니는 배경
struct ThemedBackground: View {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false

    var body: some View {
        ZStack {
            LinearGradient(colors: theme.background, startPoint: .top, endPoint: .bottom)

            GeometryReader { geo in
                let w: CGFloat = geo.size.width
                let h: CGFloat = geo.size.height
                let x1: CGFloat = drift ? -w * 0.25 : w * 0.2
                let y1: CGFloat = drift ? -h * 0.28 : -h * 0.12
                let x2: CGFloat = drift ? w * 0.3 : -w * 0.15
                let y2: CGFloat = drift ? h * 0.3 : h * 0.18
                ZStack {
                    Circle()
                        .fill(theme.orb[2].opacity(0.28))
                        .frame(width: w * 0.9)
                        .blur(radius: 80)
                        .offset(x: x1, y: y1)
                    Circle()
                        .fill(theme.orb[1].opacity(0.18))
                        .frame(width: w * 0.8)
                        .blur(radius: 90)
                        .offset(x: x2, y: y2)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }
}

// MARK: - 카드

extension View {
    /// 반투명 유리 카드. iOS 26 이상에서는 Liquid Glass를 쓴다.
    #if compiler(>=6.2)
    @ViewBuilder
    func glassCard(cornerRadius: CGFloat = 24, tint: Color? = nil) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(
                tint.map { Glass.regular.tint($0.opacity(0.18)) } ?? Glass.regular,
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
        } else {
            self.fallbackGlass(shape: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous), tint: tint)
        }
    }
    #else
    func glassCard(cornerRadius: CGFloat = 24, tint: Color? = nil) -> some View {
        self.fallbackGlass(shape: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous), tint: tint)
    }
    #endif

    private func fallbackGlass(shape: RoundedRectangle, tint: Color?) -> some View {
        self
            .background {
                ZStack {
                    shape.fill(.ultraThinMaterial)
                    if let tint { shape.fill(tint.opacity(0.10)) }
                }
            }
            .overlay(shape.strokeBorder(.white.opacity(0.12), lineWidth: 1))
    }
}

// MARK: - 버튼

/// 화면 하단의 큰 주 버튼 (시작하기 등)
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(
                Capsule().fill(LinearGradient(colors: [theme.orb[0], theme.orb[1]], startPoint: .topLeading, endPoint: .bottomTrailing))
            )
            .shadow(color: theme.orb[1].opacity(0.45), radius: configuration.isPressed ? 6 : 18, y: 6)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(isEnabled ? 1 : 0.4)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// 테두리만 있는 보조 버튼
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Capsule().fill(.white.opacity(configuration.isPressed ? 0.18 : 0.10)))
            .overlay(Capsule().strokeBorder(.white.opacity(0.16)))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// 원형 아이콘 버튼 (세션 화면 컨트롤)
struct CircleIconButton: View {
    let systemName: String
    var size: CGFloat = 56
    var prominent = false
    let label: String
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(prominent ? theme.ink : .white)
                .frame(width: size, height: size)
                .background {
                    if prominent {
                        Circle().fill(LinearGradient(colors: [theme.orb[0], theme.orb[1]], startPoint: .top, endPoint: .bottom))
                    } else {
                        Circle().fill(.white.opacity(0.12))
                    }
                }
                .overlay(Circle().strokeBorder(.white.opacity(prominent ? 0 : 0.15)))
                .contentShape(Circle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(label)
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.65), value: configuration.isPressed)
    }
}

/// 선택형 칩 (4초, 5분 등)
struct Chip: View {
    let title: String
    var subtitle: String? = nil
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .opacity(0.75)
                }
            }
            .foregroundStyle(isSelected ? theme.ink : .white)
            .padding(.horizontal, 16)
            .padding(.vertical, subtitle == nil ? 10 : 8)
            .frame(minWidth: 56)
            .background(
                Capsule().fill(isSelected ? AnyShapeStyle(theme.orb[0]) : AnyShapeStyle(Color.white.opacity(0.10)))
            )
            .overlay(Capsule().strokeBorder(.white.opacity(isSelected ? 0 : 0.14)))
            .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: isSelected) { _, selected in selected }
    }
}

// MARK: - 텍스트

struct SectionTitle: View {
    let title: String
    var caption: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            if let caption {
                Text(caption)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

/// 작은 라벨 배지 (카테고리 등)
struct Tag: View {
    let text: String
    var symbol: String? = nil
    var color: Color = .white

    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(color.opacity(0.15)))
    }
}

// MARK: - 호흡 단계 표시

/// "들숨 4 → 멈춤 7 → 날숨 8" 을 알약 모양으로 보여준다. 현재 단계를 강조할 수 있다.
struct PhaseSequenceView: View {
    let phases: [BreathPhase]
    var currentIndex: Int? = nil
    var compact = false
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            ForEach(Array(phases.enumerated()), id: \.offset) { index, phase in
                let active = currentIndex == index
                VStack(spacing: 1) {
                    Text(phase.duration.secondsText)
                        .font(compact ? .caption.weight(.bold) : .subheadline.weight(.bold))
                        .monospacedDigit()
                    Text(phase.customInstruction ?? phase.kind.shortTitle)
                        .font(.caption2)
                        .lineLimit(1)
                        .opacity(0.8)
                }
                .foregroundStyle(active ? theme.ink : .white)
                .padding(.horizontal, compact ? 8 : 12)
                .padding(.vertical, compact ? 5 : 7)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(active ? AnyShapeStyle(theme.orb[0]) : AnyShapeStyle(Color.white.opacity(0.08)))
                )
                .scaleEffect(active ? 1.06 : 1)
                .animation(.spring(response: 0.35, dampingFraction: 0.7), value: active)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(phases.map { "\($0.kind.shortTitle) \($0.duration.secondsText)초" }.joined(separator: ", "))
    }
}

// MARK: - 기타

struct StatTile: View {
    let value: String
    let label: String
    let symbol: String
    var tint: Color = .white

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassCard(cornerRadius: 20)
        .accessibilityElement(children: .combine)
    }
}
