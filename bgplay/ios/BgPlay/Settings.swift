import Foundation

final class Settings {
    static let shared = Settings()
    private let defaults = UserDefaults.standard

    static let homeYouTube = URL(string: "https://m.youtube.com/")!
    static let homeMusic = URL(string: "https://music.youtube.com/")!

    /// Brave iOS 의 "백그라운드 오디오(Media Backgrounding)" 토글에 해당.
    var backgroundPlay: Bool {
        get { defaults.object(forKey: "backgroundPlay") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "backgroundPlay") }
    }

    /// 잠금화면 정보를 앱이 직접 채울지. WebKit 이 자체적으로 Now Playing 을 갱신해
    /// 서로 덮어쓰는 기기가 있으면 false 로 바꿔 비교 테스트한다.
    var nativeNowPlaying: Bool {
        get { defaults.object(forKey: "nativeNowPlaying") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "nativeNowPlaying") }
    }

    var lastURL: URL? {
        get { defaults.string(forKey: "lastURL").flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: "lastURL") }
    }
}
