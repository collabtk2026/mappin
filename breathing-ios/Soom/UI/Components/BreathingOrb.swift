import SwiftUI

/// 숨결에 맞춰 커지고 작아지는 빛나는 구슬.
/// level: 폐가 찬 정도(0...1), progress: 현재 단계 진행률(0...1), time: 꽃잎 회전용 시간(초)
struct BreathingOrb: View {
    var level: Double
    var progress: Double
    var time: TimeInterval
    var showsRing = true
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            // 동작 줄이기 설정이면 크기 변화를 작게 하고 밝기로 표현한다
            let minScale = reduceMotion ? 0.82 : 0.5
            let scale = minScale + (1 - minScale) * level
            let coreSize = size * 0.66

            ZStack {
                // 기준 원: 다 들이마셨을 때 크기
                Circle()
                    .strokeBorder(.white.opacity(0.10), lineWidth: 1)
                    .frame(width: coreSize, height: coreSize)
                Circle()
                    .strokeBorder(.white.opacity(0.06), style: StrokeStyle(lineWidth: 1, dash: [2, 6]))
                    .frame(width: coreSize * minScale, height: coreSize * minScale)

                // 바깥 빛
                Circle()
                    .fill(RadialGradient(colors: [theme.orb[1].opacity(0.55), theme.orb[2].opacity(0)],
                                         center: .center, startRadius: 0, endRadius: size * 0.5))
                    .frame(width: size, height: size)
                    .scaleEffect(0.7 + 0.3 * scale)
                    .opacity(0.45 + 0.55 * level)
                    .blur(radius: 24)

                // 꽃잎처럼 겹치는 빛 (천천히 회전)
                if !reduceMotion {
                    ZStack {
                        ForEach(0..<6, id: \.self) { i in
                            let angle = Angle.degrees(Double(i) * 60 + time * 6)
                            let radius = coreSize * 0.16 * (0.35 + 0.65 * level)
                            Circle()
                                .fill(LinearGradient(colors: [theme.orb[1].opacity(0.55), theme.orb[2].opacity(0.25)],
                                                     startPoint: .top, endPoint: .bottom))
                                .frame(width: coreSize * 0.62, height: coreSize * 0.62)
                                .offset(x: cos(angle.radians) * radius, y: sin(angle.radians) * radius)
                                .blendMode(.plusLighter)
                        }
                    }
                    .scaleEffect(scale)
                    .blur(radius: 6)
                }

                // 중심 구슬
                Circle()
                    .fill(RadialGradient(colors: [theme.orb[0], theme.orb[1], theme.orb[2]],
                                         center: UnitPoint(x: 0.38, y: 0.32),
                                         startRadius: 0, endRadius: coreSize * 0.62))
                    .overlay(
                        Circle()
                            .fill(RadialGradient(colors: [.white.opacity(0.55), .clear],
                                                 center: UnitPoint(x: 0.32, y: 0.25),
                                                 startRadius: 0, endRadius: coreSize * 0.3))
                    )
                    .frame(width: coreSize * 0.8, height: coreSize * 0.8)
                    .scaleEffect(scale)
                    .shadow(color: theme.orb[1].opacity(0.6), radius: 30)
                    .brightness(reduceMotion ? (level - 0.5) * 0.12 : 0)

                // 단계 진행 링
                if showsRing {
                    Circle()
                        .stroke(.white.opacity(0.10), lineWidth: 3)
                        .frame(width: size * 0.92, height: size * 0.92)
                    Circle()
                        .trim(from: 0, to: max(0.001, progress))
                        .stroke(theme.orb[0].opacity(0.9), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .frame(width: size * 0.92, height: size * 0.92)
                        .rotationEffect(.degrees(-90))
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// 카드나 편집기에서 패턴을 미리 보여주는 작은 구슬 (스스로 반복 재생)
struct OrbPreview: View {
    let pattern: BreathingPattern
    var showsRing = false
    @State private var origin = Date()

    var body: some View {
        let timeline = SessionTimeline(pattern: pattern, cycles: nil)
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
            let elapsed = context.date.timeIntervalSince(origin)
            let snap = timeline.snapshot(at: elapsed)
            BreathingOrb(level: snap.level, progress: snap.phaseProgress,
                         time: context.date.timeIntervalSinceReferenceDate, showsRing: showsRing)
        }
        .onChange(of: pattern.phases) { _, _ in origin = Date() }
    }
}
