import UIKit
import WebKit

/// 보관함(임시함·카테고리·분류 시트) 오버레이. UI/로직은 공용 웹 모듈(번들의 library/ = shared/web/library),
/// 여기서는 띄우기/숨기기, 저장, 브리지만 한다. 투명 WKWebView 를 화면 전체에 겹쳐 두고 닫혀 있으면 숨긴다.
final class LibraryOverlay: NSObject {
    struct QueueItem { let videoId: String; let url: URL; let title: String }

    var onStats: ((_ inbox: Int, _ total: Int) -> Void)?
    var onPlay: ((_ url: URL, _ keepOpen: Bool) -> Void)?
    var onPlayQueue: ((_ name: String, _ items: [QueueItem], _ index: Int) -> Void)?
    var onToast: ((String) -> Void)?
    var onExport: ((_ json: String, _ filename: String) -> Void)?

    let webView: WKWebView
    private let store = LibraryStore.shared
    private var ready = false
    private var whenReady: [() -> Void] = []

    override init() {
        let config = WKWebViewConfiguration()
        let ucc = WKUserContentController()
        config.userContentController = ucc
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        ucc.add(WeakScriptMessageHandler(self), name: "bglib")
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never // CSS env(safe-area-inset-*) 로 처리
        webView.navigationDelegate = self
        webView.isHidden = true
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "library") {
            webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        } else {
            assertionFailure("library/index.html missing from bundle")
        }
    }

    var isShowing: Bool { !webView.isHidden }

    /// 상단 "＋ 임시": 결과 {status, title, where[], inbox}
    func quickSave(_ track: [String: Any], completion: @escaping ([String: Any]?) -> Void) {
        runWhenReady {
            self.webView.evaluateJavaScript("__bglib.quickSave(\(Self.json(track)))") { result, _ in
                guard let s = result as? String, let data = s.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return completion(nil) }
                completion(obj)
            }
        }
    }

    /// 상단 "분류": 분류 시트
    func openSave(_ track: [String: Any]) {
        runWhenReady {
            self.show()
            self.webView.evaluateJavaScript("__bglib.openSave(\(Self.json(track)))", completionHandler: nil)
        }
    }

    func openLibrary(nowPlaying: [String: Any]?) {
        runWhenReady {
            self.show()
            let np = nowPlaying.map { Self.json($0) } ?? "null"
            self.webView.evaluateJavaScript("__bglib.nowPlaying(\(np));__bglib.openLibrary(null)", completionHandler: nil)
        }
    }

    func hide() {
        webView.endEditing(true)
        webView.isHidden = true
    }

    private func show() {
        webView.superview?.bringSubviewToFront(webView)
        webView.isHidden = false
    }

    private func runWhenReady(_ block: @escaping () -> Void) {
        if ready { block() } else { whenReady.append(block) }
    }

    private func boot() {
        let arg = store.read().map { Self.json($0) } ?? "null"   // JSON 문자열 리터럴로 전달
        webView.evaluateJavaScript("__bglib.boot(\(arg))") { [weak self] _, _ in
            guard let self else { return }
            self.ready = true
            let queued = self.whenReady
            self.whenReady.removeAll()
            queued.forEach { $0() }
        }
    }

    private func handle(_ o: [String: Any]) {
        switch o["type"] as? String {
        case "ready":
            boot()
        case "persist":
            if let data = o["data"] as? String { store.write(data) }
        case "stats":
            onStats?(o["inbox"] as? Int ?? 0, o["total"] as? Int ?? 0)
        case "close":
            hide()
        case "play":
            guard let s = o["url"] as? String, let url = URL(string: s), URLPolicy.isYouTube(host: url.host) else { return }
            let keep = o["keepOpen"] as? Bool ?? false
            if !keep { hide() }
            onPlay?(url, keep)
        case "playQueue":
            let raw = o["items"] as? [[String: Any]] ?? []
            let items: [QueueItem] = raw.compactMap { it in
                guard let s = it["url"] as? String, let url = URL(string: s), let id = URLPolicy.videoId(of: s) else { return nil }
                return QueueItem(videoId: id, url: url, title: it["title"] as? String ?? "")
            }
            guard !items.isEmpty else { return }
            hide()
            let index = max(0, min(items.count - 1, o["index"] as? Int ?? 0))
            onPlayQueue?(o["name"] as? String ?? "", items, index)
        case "toast":
            if let t = o["text"] as? String { onToast?(t) }
        case "export":
            if let j = o["json"] as? String { onExport?(j, o["filename"] as? String ?? "bgplay-library.json") }
        default:
            break
        }
    }

    /// Swift 값을 JS 리터럴로 (JSON 은 유효한 JS 식).
    static func json(_ value: Any) -> String {
        if let s = value as? String {
            // 문자열 하나는 배열로 감싸 직렬화한 뒤 [ ] 를 벗긴다 (top-level fragment 회피)
            guard let d = try? JSONSerialization.data(withJSONObject: [s]), let a = String(data: d, encoding: .utf8) else { return "null" }
            return String(a.dropFirst().dropLast())
        }
        guard JSONSerialization.isValidJSONObject(value),
              let d = try? JSONSerialization.data(withJSONObject: value),
              let s = String(data: d, encoding: .utf8) else { return "null" }
        return s
    }
}

extension LibraryOverlay: WKScriptMessageHandler {
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        // 우리 번들의 file:// 페이지만 받는다.
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "file",
              let body = message.body as? String, let data = body.data(using: .utf8),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        handle(o)
    }
}

extension LibraryOverlay: WKNavigationDelegate {
    /// 보관함 페이지 밖으로는 이동하지 않는다.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.isFileURL == true ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        ready = false
        webView.reload()
    }
}
