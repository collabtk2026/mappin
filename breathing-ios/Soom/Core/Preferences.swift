import Foundation

enum VoiceMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case off, firstCycles, always
    var id: String { rawValue }
    var title: String {
        switch self {
        case .off: return "끄기"
        case .firstCycles: return "처음 3회만"
        case .always: return "항상"
        }
    }
    /// 이 주기(0부터)에서 음성 안내를 할지
    func shouldSpeak(cycle: Int) -> Bool {
        switch self {
        case .off: return false
        case .firstCycles: return cycle < 3
        case .always: return true
        }
    }
}

enum HapticMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case off, transitions, continuous
    var id: String { rawValue }
    var title: String {
        switch self {
        case .off: return "끄기"
        case .transitions: return "단계가 바뀔 때"
        case .continuous: return "숨결 따라 계속"
        }
    }
    var detail: String {
        switch self {
        case .off: return "진동을 쓰지 않습니다."
        case .transitions: return "들숨·날숨이 바뀔 때 톡 하고 알려줍니다."
        case .continuous: return "들이쉴수록 강해지고 내쉴수록 약해지는 진동으로, 눈을 감고도 따라 할 수 있습니다."
        }
    }
}

enum AmbientSound: String, Codable, CaseIterable, Identifiable, Sendable {
    case none, rain, ocean, deep, white
    var id: String { rawValue }
    var title: String {
        switch self {
        case .none: return "없음"
        case .rain: return "빗소리"
        case .ocean: return "파도"
        case .deep: return "깊은 소음"
        case .white: return "백색 소음"
        }
    }
    var symbol: String {
        switch self {
        case .none: return "speaker.slash"
        case .rain: return "cloud.rain"
        case .ocean: return "water.waves"
        case .deep: return "circle.hexagongrid"
        case .white: return "aqi.medium"
        }
    }
}

enum ThemeID: String, Codable, CaseIterable, Identifiable, Sendable {
    case dawn, ocean, forest, sunset, midnight
    var id: String { rawValue }
    var title: String {
        switch self {
        case .dawn: return "새벽"
        case .ocean: return "바다"
        case .forest: return "숲"
        case .sunset: return "노을"
        case .midnight: return "한밤"
        }
    }
}

/// 사용자 설정. 저장된 값에 새 항목이 없어도 기본값으로 읽히도록 직접 디코딩한다.
struct Preferences: Codable, Equatable, Sendable {
    var selectedPatternID: String = Presets.default.id
    var sessionLength: SessionLength = .minutes(3)
    var voiceMode: VoiceMode = .firstCycles
    var chimeEnabled: Bool = true
    var cueVolume: Double = 0.7
    var hapticMode: HapticMode = .transitions
    var ambient: AmbientSound = .none
    var ambientVolume: Double = 0.4
    var countdownEnabled: Bool = true
    var keepScreenOn: Bool = true
    var theme: ThemeID = .dawn
    var healthSyncEnabled: Bool = false
    var reminderEnabled: Bool = false
    var reminderHour: Int = 21
    var reminderMinute: Int = 30
    var hasOnboarded: Bool = false

    init() {}

    private enum CodingKeys: String, CodingKey {
        case selectedPatternID, sessionLength, voiceMode, chimeEnabled, cueVolume, hapticMode,
             ambient, ambientVolume, countdownEnabled, keepScreenOn, theme, healthSyncEnabled,
             reminderEnabled, reminderHour, reminderMinute, hasOnboarded
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Preferences()
        selectedPatternID = (try? c.decodeIfPresent(String.self, forKey: .selectedPatternID)) ?? d.selectedPatternID
        sessionLength = (try? c.decodeIfPresent(SessionLength.self, forKey: .sessionLength)) ?? d.sessionLength
        voiceMode = (try? c.decodeIfPresent(VoiceMode.self, forKey: .voiceMode)) ?? d.voiceMode
        chimeEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .chimeEnabled)) ?? d.chimeEnabled
        cueVolume = (try? c.decodeIfPresent(Double.self, forKey: .cueVolume)) ?? d.cueVolume
        hapticMode = (try? c.decodeIfPresent(HapticMode.self, forKey: .hapticMode)) ?? d.hapticMode
        ambient = (try? c.decodeIfPresent(AmbientSound.self, forKey: .ambient)) ?? d.ambient
        ambientVolume = (try? c.decodeIfPresent(Double.self, forKey: .ambientVolume)) ?? d.ambientVolume
        countdownEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .countdownEnabled)) ?? d.countdownEnabled
        keepScreenOn = (try? c.decodeIfPresent(Bool.self, forKey: .keepScreenOn)) ?? d.keepScreenOn
        theme = (try? c.decodeIfPresent(ThemeID.self, forKey: .theme)) ?? d.theme
        healthSyncEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .healthSyncEnabled)) ?? d.healthSyncEnabled
        reminderEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .reminderEnabled)) ?? d.reminderEnabled
        reminderHour = (try? c.decodeIfPresent(Int.self, forKey: .reminderHour)) ?? d.reminderHour
        reminderMinute = (try? c.decodeIfPresent(Int.self, forKey: .reminderMinute)) ?? d.reminderMinute
        hasOnboarded = (try? c.decodeIfPresent(Bool.self, forKey: .hasOnboarded)) ?? d.hasOnboarded
    }

    /// 소리가 하나라도 나는지 (잠금 화면에서도 세션을 이어갈 수 있는지)
    var usesAudio: Bool {
        voiceMode != .off || chimeEnabled || ambient != .none
    }
}
