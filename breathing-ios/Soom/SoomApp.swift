import SwiftUI

@main
struct SoomApp: App {
    @State private var settings = SettingsStore()
    @State private var patterns = PatternStore()
    @State private var history = HistoryStore()
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(patterns)
                .environment(history)
                .environment(router)
        }
    }
}

/// 화면 전환 상태 (탭, 세션 화면)
@Observable
final class AppRouter {
    enum Tab: Hashable { case breathe, history, settings }

    var tab: Tab = .breathe
    var session: SessionRequest?

    func start(_ pattern: BreathingPattern, length: SessionLength) {
        session = SessionRequest(pattern: pattern, length: length)
    }
}

struct SessionRequest: Identifiable, Hashable {
    let id = UUID()
    let pattern: BreathingPattern
    let length: SessionLength
}

struct RootView: View {
    @Environment(SettingsStore.self) private var settings
    @Environment(PatternStore.self) private var patterns
    @Environment(HistoryStore.self) private var history
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        let theme = Theme.of(settings.prefs.theme)

        TabView(selection: $router.tab) {
            HomeView()
                .tabItem { Label("호흡", systemImage: "wind") }
                .tag(AppRouter.Tab.breathe)
            HistoryView()
                .tabItem { Label("기록", systemImage: "chart.bar.fill") }
                .tag(AppRouter.Tab.history)
            SettingsView()
                .tabItem { Label("설정", systemImage: "gearshape.fill") }
                .tag(AppRouter.Tab.settings)
        }
        .fullScreenCover(item: $router.session) { request in
            SessionView(request: request, prefs: settings.prefs)
                .environment(settings)
                .environment(patterns)
                .environment(history)
                .environment(router)
                .environment(\.theme, theme)
                .preferredColorScheme(.dark)
                .fontDesign(.rounded)
        }
        .fullScreenCover(isPresented: Binding(
            get: { !settings.prefs.hasOnboarded },
            set: { if !$0 { settings.prefs.hasOnboarded = true } }
        )) {
            OnboardingView()
                .environment(settings)
                .environment(\.theme, theme)
                .preferredColorScheme(.dark)
                .fontDesign(.rounded)
        }
        .environment(\.theme, theme)
        .tint(theme.accent)
        .preferredColorScheme(.dark)
        .fontDesign(.rounded)
    }
}
