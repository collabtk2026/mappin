import SwiftUI

/// 처음 실행할 때 보여주는 3장짜리 안내
struct OnboardingView: View {
    @Environment(SettingsStore.self) private var settings
    @Environment(\.theme) private var theme
    @State private var page = 0

    private let pages: [(symbol: String, title: String, body: String)] = [
        ("wind", "숨, 천천히", "하루 몇 분, 호흡에만 집중하는 시간을 만들어 보세요.\n긴장은 풀리고 마음은 고요해집니다."),
        ("circle.circle", "구슬을 따라 숨 쉬세요", "구슬이 커지면 들이마시고, 작아지면 내쉽니다.\n소리·음성·진동으로도 안내하니 눈을 감아도 괜찮아요."),
        ("heart.text.square", "편안하게, 무리하지 말고", "어지럽거나 숨이 차면 바로 멈추고 평소처럼 숨 쉬세요.\n운전 중이나 물속에서는 하지 마세요."),
    ]

    var body: some View {
        ZStack {
            ThemedBackground()

            VStack(spacing: 0) {
                TabView(selection: $page) {
                    ForEach(pages.indices, id: \.self) { i in
                        pageView(pages[i], index: i)
                            .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                HStack(spacing: 8) {
                    ForEach(pages.indices, id: \.self) { i in
                        Capsule()
                            .fill(.white.opacity(i == page ? 0.9 : 0.25))
                            .frame(width: i == page ? 22 : 8, height: 8)
                    }
                }
                .animation(.spring(response: 0.35), value: page)
                .padding(.bottom, 24)
                .accessibilityHidden(true)

                Button {
                    if page < pages.count - 1 {
                        withAnimation { page += 1 }
                    } else {
                        settings.prefs.hasOnboarded = true
                    }
                } label: {
                    Text(page < pages.count - 1 ? "다음" : "시작하기")
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, 24)
                .padding(.bottom, 12)

                Button("건너뛰기") { settings.prefs.hasOnboarded = true }
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
                    .opacity(page < pages.count - 1 ? 1 : 0)
                    .padding(.bottom, 16)
            }
        }
    }

    private func pageView(_ item: (symbol: String, title: String, body: String), index: Int) -> some View {
        VStack(spacing: 28) {
            Spacer()
            if index == 1 {
                OrbPreview(pattern: Presets.equal, showsRing: true)
                    .frame(width: 220, height: 220)
            } else {
                ZStack {
                    Circle()
                        .fill(RadialGradient(colors: [theme.orb[1].opacity(0.5), .clear], center: .center, startRadius: 0, endRadius: 110))
                        .frame(width: 220, height: 220)
                    Image(systemName: item.symbol)
                        .font(.system(size: 64, weight: .light))
                        .foregroundStyle(theme.orb[0])
                }
            }
            VStack(spacing: 14) {
                Text(item.title)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(.white)
                Text(item.body)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.75))
                    .lineSpacing(4)
            }
            .padding(.horizontal, 32)
            Spacer()
            Spacer()
        }
    }
}
