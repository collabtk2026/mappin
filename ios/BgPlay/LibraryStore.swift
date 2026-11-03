import Foundation

/// 보관함 JSON 저장소. 모델·로직은 공용 웹 모듈(shared/web/library/core.js)에 있고, 여기선 저장만 한다.
final class LibraryStore {
    static let shared = LibraryStore()
    private let queue = DispatchQueue(label: "bgplay.library.io")
    private let url: URL

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("library.json")
    }

    func read() -> String? {
        queue.sync { try? String(contentsOf: url, encoding: .utf8) }
    }

    func write(_ json: String) {
        queue.async { [url] in
            do { try json.write(to: url, atomically: true, encoding: .utf8) } catch { NSLog("[BgPlay] library write failed: \(error)") }
        }
    }
}
