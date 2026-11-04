import SwiftUI

/// 설정 탭
struct SettingsView: View {
    @Environment(SettingsStore.self) private var settings
    @Environment(HistoryStore.self) private var history
    @Environment(\.theme) private var theme

    @State private var confirmClear = false
    @State private var alertMessage: String?

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            Form {
                Section {
                    Picker("음성 안내", selection: $settings.prefs.voiceMode) {
                        ForEach(VoiceMode.allCases) { Text($0.title).tag($0) }
                    }
                    Toggle("신호음", isOn: $settings.prefs.chimeEnabled)
                    VolumeSlider(value: $settings.prefs.cueVolume, label: "안내 음량")
                } header: {
                    Text("소리 안내")
                } footer: {
                    Text("소리 안내를 켜 두면 화면을 잠가도 세션이 계속됩니다. 무음 모드에서도 들립니다.")
                }

                Section {
                    Picker("진동", selection: $settings.prefs.hapticMode) {
                        ForEach(HapticMode.allCases) { Text($0.title).tag($0) }
                    }
                } header: {
                    Text("진동")
                } footer: {
                    Text(settings.prefs.hapticMode.detail)
                }

                Section("배경 소리") {
                    AmbientPicker(selection: $settings.prefs.ambient)
                    if settings.prefs.ambient != .none {
                        VolumeSlider(value: $settings.prefs.ambientVolume, label: "배경 음량")
                    }
                }

                Section("세션") {
                    Toggle("시작 전 3초 준비", isOn: $settings.prefs.countdownEnabled)
                    Toggle("세션 중 화면 켜두기", isOn: $settings.prefs.keepScreenOn)
                }

                Section("테마") {
                    ThemePicker(selection: $settings.prefs.theme)
                        .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                }

                Section {
                    Toggle("매일 알림", isOn: Binding(
                        get: { settings.prefs.reminderEnabled },
                        set: { setReminder($0) }
                    ))
                    if settings.prefs.reminderEnabled {
                        DatePicker("알림 시간", selection: reminderTime, displayedComponents: .hourAndMinute)
                    }
                } header: {
                    Text("알림")
                } footer: {
                    Text("정해진 시간에 숨 고를 시간을 알려 드려요.")
                }

                if HealthKitManager.shared.isAvailable {
                    Section {
                        Toggle("건강 앱에 기록", isOn: Binding(
                            get: { settings.prefs.healthSyncEnabled },
                            set: { setHealth($0) }
                        ))
                    } header: {
                        Text("Apple 건강")
                    } footer: {
                        Text("마친 세션을 건강 앱의 ‘마음챙김 시간’에 저장합니다.")
                    }
                }

                Section("도움말") {
                    NavigationLink {
                        SafetyView()
                    } label: {
                        Label("안전하게 호흡하기", systemImage: "heart.text.square")
                    }
                    NavigationLink {
                        GuideView()
                    } label: {
                        Label("호흡법과 근거", systemImage: "book")
                    }
                    Button {
                        settings.prefs.hasOnboarded = false
                    } label: {
                        Label("처음 안내 다시 보기", systemImage: "sparkles")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        confirmClear = true
                    } label: {
                        Label("기록 모두 지우기", systemImage: "trash")
                    }
                    .disabled(history.records.isEmpty)
                } footer: {
                    Text("숨 · 버전 \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")\n모든 기록은 이 기기에만 저장됩니다.")
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.top, 12)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ThemedBackground())
            .navigationTitle("설정")
            .confirmationDialog("모든 기록을 지울까요?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("모두 지우기", role: .destructive) { history.deleteAll() }
                Button("취소", role: .cancel) {}
            } message: {
                Text("지운 기록은 되돌릴 수 없습니다.")
            }
            .alert("알림", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
                Button("확인", role: .cancel) {}
            } message: {
                Text(alertMessage ?? "")
            }
        }
    }

    private var reminderTime: Binding<Date> {
        Binding {
            Calendar.current.date(from: DateComponents(hour: settings.prefs.reminderHour, minute: settings.prefs.reminderMinute)) ?? Date()
        } set: { date in
            let c = Calendar.current.dateComponents([.hour, .minute], from: date)
            settings.prefs.reminderHour = c.hour ?? 21
            settings.prefs.reminderMinute = c.minute ?? 30
            ReminderManager.schedule(hour: settings.prefs.reminderHour, minute: settings.prefs.reminderMinute)
        }
    }

    private func setReminder(_ on: Bool) {
        guard on else {
            settings.prefs.reminderEnabled = false
            ReminderManager.cancel()
            return
        }
        Task { @MainActor in
            if await ReminderManager.requestPermission() {
                settings.prefs.reminderEnabled = true
                ReminderManager.schedule(hour: settings.prefs.reminderHour, minute: settings.prefs.reminderMinute)
            } else {
                alertMessage = "알림 권한이 꺼져 있어요. 설정 앱 > 숨 > 알림에서 허용해 주세요."
            }
        }
    }

    private func setHealth(_ on: Bool) {
        guard on else {
            settings.prefs.healthSyncEnabled = false
            return
        }
        Task { @MainActor in
            if await HealthKitManager.shared.requestAuthorization() {
                settings.prefs.healthSyncEnabled = true
            } else {
                alertMessage = "건강 앱 쓰기 권한이 없어요. 건강 앱 > 공유 > 앱 > 숨에서 ‘마음챙김’을 허용해 주세요."
            }
        }
    }
}

// MARK: - 설정 부품

struct VolumeSlider: View {
    @Binding var value: Double
    let label: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "speaker.fill")
                .foregroundStyle(.secondary)
            Slider(value: $value, in: 0...1)
            Image(systemName: "speaker.wave.3.fill")
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue("\(Int(value * 100))퍼센트")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: value = min(1, value + 0.1)
            case .decrement: value = max(0, value - 0.1)
            @unknown default: break
            }
        }
    }
}

struct AmbientPicker: View {
    @Binding var selection: AmbientSound

    var body: some View {
        Picker("배경 소리", selection: $selection) {
            ForEach(AmbientSound.allCases) { sound in
                Label(sound.title, systemImage: sound.symbol).tag(sound)
            }
        }
    }
}

struct ThemePicker: View {
    @Binding var selection: ThemeID

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Theme.all, id: \.id) { theme in
                Button {
                    withAnimation(.easeInOut) { selection = theme.id }
                } label: {
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(LinearGradient(colors: theme.background, startPoint: .top, endPoint: .bottom))
                            Circle()
                                .fill(RadialGradient(colors: [theme.orb[0], theme.orb[1], theme.orb[2]], center: .topLeading, startRadius: 0, endRadius: 30))
                                .padding(12)
                        }
                        .frame(width: 52, height: 52)
                        .overlay(Circle().strokeBorder(.white.opacity(selection == theme.id ? 0.9 : 0.15), lineWidth: selection == theme.id ? 2.5 : 1))
                        Text(theme.title)
                            .font(.caption)
                            .foregroundStyle(selection == theme.id ? .white : .white.opacity(0.6))
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(theme.title) 테마")
                .accessibilityAddTraits(selection == theme.id ? .isSelected : [])
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }
}
