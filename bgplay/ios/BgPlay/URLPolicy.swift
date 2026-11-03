import Foundation

/// WebView 안에서 열 호스트. 나머지는 Safari/다른 앱으로 넘긴다.
enum URLPolicy {
    private static let suffixes = [
        "youtube.com", "youtu.be", "youtube-nocookie.com", "ytimg.com", "ggpht.com",
        "googlevideo.com", "gstatic.com", "googleusercontent.com", "google.com",
    ]

    static func isInternal(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host?.lowercased() else { return false }
        if suffixes.contains(where: { host == $0 || host.hasSuffix("." + $0) }) { return true }
        // accounts.google.co.kr 같은 국가별 Google 도메인
        return host.range(of: #"(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$"#, options: .regularExpression) != nil
    }

    static func isYouTube(host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "youtube.com" || host.hasSuffix(".youtube.com") || host == "youtu.be"
    }

    /// core.js parseVideo 와 같은 규칙: watch?v= / youtu.be / shorts / live / embed
    static func videoId(of string: String?) -> String? {
        guard let string, let url = URL(string: string), isYouTube(host: url.host) else { return nil }
        let host = url.host!.lowercased()
        let parts = url.path.split(separator: "/").map(String.init)
        var id: String?
        if host == "youtu.be" {
            id = parts.first
        } else if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "v" })?.value {
            id = v
        } else if parts.count >= 2, ["shorts", "live", "embed", "v"].contains(parts[0]) {
            id = parts[1]
        }
        guard let id, id.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil else { return nil }
        return id
    }

    /// bgplay://open?url=<encoded>  또는 YouTube https URL 그대로.
    static func target(from url: URL) -> URL? {
        if url.scheme?.lowercased() == "bgplay" {
            let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "url" })?.value
            guard let raw, let inner = URL(string: raw) else { return nil }
            return isYouTube(host: inner.host) ? inner : nil
        }
        return isYouTube(host: url.host) ? url : nil
    }
}
