import UIKit
import WebKit

/// WKWebView(WebKit) 1개로 YouTube / YouTube Music 을 띄우고, bgplay.js 와 잠금화면/오디오 세션을 잇는다.
///
/// iOS 에서는 App Store 규정상 모든 브라우저가 WebKit 을 써야 하므로(Brave iOS 도 WKWebView)
/// Chromium 대신 WKWebView 를 쓴다. 백그라운드 재생은 다음 3개 레이어의 합이다.
///   1) 페이지: bgplay.js (가시성 위장 + 엔진 정지 자동 재개) — Brave iOS media_backgrounding.ts 와 동일 로직
///   2) 엔진: WKWebViewConfiguration (인라인 재생, 자동재생, PiP 허용)
///   3) OS: UIBackgroundModes=audio + AVAudioSession(.playback) + MPRemoteCommandCenter
final class PlayerViewController: UIViewController {

    private var webView: WKWebView!
    private let toolbar = UIToolbar()
    private let settings = Settings.shared
    private let nowPlaying = NowPlayingController()
    private let audio = AudioSessionManager.shared
    private var info = PlaybackInfo()
    private var urlObservation: NSKeyValueObservation?
    private var backItem: UIBarButtonItem!
    private var forwardItem: UIBarButtonItem!
    private var bgItem: UIBarButtonItem!
    private var pendingURL: URL?

    // 상단 바: ① 임시 저장 ② 분류 저장 ③ 보관함
    private let topBar = UIStackView()
    private var libraryButton: UIButton!
    private let library = LibraryOverlay()
    private let snack = SnackBar()
    private static let accent = UIColor(red: 1, green: 0.31, blue: 0.27, alpha: 1)

    // 보관함 "전체 재생" 큐
    private var queue: [LibraryOverlay.QueueItem] = []
    private var queueIndex = -1
    private var queueName: String?
    private var awaitingId: String?
    private var awaitingSince = Date.distantPast
    private var hasQueueNext: Bool { !queue.isEmpty && queueIndex + 1 < queue.count }

    private static let script: String = {
        guard let url = Bundle.main.url(forResource: "bgplay", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            assertionFailure("bgplay.js missing from bundle")
            return ""
        }
        return source
    }()

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0.06, alpha: 1)
        webView = makeWebView()
        layout()
        buildToolbar()
        buildTopBar()
        wireLibrary()

        nowPlaying.onCommand = { [weak self] name, arg in
            guard let self else { return }
            switch name {
            case "next": self.skipNext()
            case "prev": self.skipPrev()
            default: self.command(name, arg)
            }
        }
        audio.onInterruption = { [weak self] began, shouldResume in
            guard let self else { return }
            if began {
                // 통화/알람 중에는 bgplay.js 의 자동 재개가 끼어들지 않게 한다.
                self.command("holdAutoResume", 10 * 60 * 1000)
            } else {
                self.command("holdAutoResume", 0)
                if shouldResume { self.command("play") }
            }
        }
        audio.onRouteLost = { [weak self] in self?.command("pause") }

        webView.load(URLRequest(url: pendingURL ?? settings.lastURL ?? Settings.homeYouTube))
        pendingURL = nil
    }

    /// bgplay:// 또는 YouTube 링크로 앱이 열렸을 때.
    func handleOpen(_ url: URL) {
        guard let target = URLPolicy.target(from: url) else { return }
        if let webView {
            webView.load(URLRequest(url: target))
        } else {
            pendingURL = target
        }
    }

    // MARK: - WebView

    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true          // 전체화면 강제 없이 페이지 안에서 재생
        config.mediaTypesRequiringUserActionForPlayback = [] // 잠금화면 버튼 -> play() 허용
        config.allowsPictureInPictureMediaPlayback = true
        config.allowsAirPlayForMediaPlayback = true
        config.websiteDataStore = .default()             // 로그인 쿠키 유지

        let ucc = WKUserContentController()
        installScript(on: ucc)
        // bgplay.js 가 페이지 프로토타입을 바꿔야 하므로 .page 월드. 메시지는 출처를 검사한다.
        ucc.add(WeakScriptMessageHandler(self), contentWorld: .page, name: "bgplay")
        config.userContentController = ucc

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.isOpaque = false
        wv.backgroundColor = view.backgroundColor
        wv.scrollView.backgroundColor = view.backgroundColor
        #if DEBUG
        if #available(iOS 16.4, *) { wv.isInspectable = true } // Safari 웹 인스펙터
        #endif
        urlObservation = wv.observe(\.url, options: [.new]) { [weak self] wv, _ in
            guard let self else { return }
            if let url = wv.url, URLPolicy.isYouTube(host: url.host) { self.settings.lastURL = url }
            self.backItem?.isEnabled = wv.canGoBack
            self.forwardItem?.isEnabled = wv.canGoForward
        }
        return wv
    }

    private func installScript(on ucc: WKUserContentController) {
        ucc.removeAllUserScripts()
        let config = "window.__BGPLAY_CONFIG={backgroundPlay:\(settings.backgroundPlay),platform:\"ios\",allowedHostSuffixes:[\"youtube.com\"]};\n"
        ucc.addUserScript(WKUserScript(
            source: config + Self.script,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false,
            in: .page
        ))
    }

    /// window.__bgplay.command(name, arg)
    func command(_ name: String, _ arg: Double? = nil) {
        let a = arg.map { $0.isFinite ? String($0) : "null" } ?? "null"
        webView?.evaluateJavaScript("window.__bgplay && window.__bgplay.command('\(name)', \(a))", completionHandler: nil)
    }

    private func handle(_ m: BridgeMessage) {
        switch m.type {
        case "state":
            info = PlaybackInfo(m)
            advanceQueue(info)
            if info.playing { audio.activate() }
            var shown = info
            shown.canNext = info.canNext || hasQueueNext
            if shown.album == nil { shown.album = queueName }
            if info.hasMedia { nowPlaying.update(shown) } else { nowPlaying.clear() }
        case "autoResume":
            NSLog("[BgPlay] engine pause detected; resumed")
        default:
            break
        }
    }

    // MARK: - UI

    private func layout() {
        webView.translatesAutoresizingMaskIntoConstraints = false
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        topBar.translatesAutoresizingMaskIntoConstraints = false
        snack.translatesAutoresizingMaskIntoConstraints = false
        library.webView.translatesAutoresizingMaskIntoConstraints = false
        toolbar.barStyle = .black
        toolbar.tintColor = .white
        view.addSubview(topBar)
        view.addSubview(webView)
        view.addSubview(toolbar)
        view.addSubview(library.webView)   // 화면 전체를 덮는 투명 오버레이 (닫혀 있으면 숨김)
        view.addSubview(snack)
        NSLayoutConstraint.activate([
            topBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            topBar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            topBar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            topBar.heightAnchor.constraint(equalToConstant: 44),
            library.webView.topAnchor.constraint(equalTo: view.topAnchor),
            library.webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            library.webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            library.webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            snack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            snack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            snack.bottomAnchor.constraint(equalTo: toolbar.topAnchor, constant: -12),
            webView.topAnchor.constraint(equalTo: topBar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: toolbar.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
        ])
    }

    private func buildToolbar() {
        func item(_ symbol: String, _ action: Selector) -> UIBarButtonItem {
            UIBarButtonItem(image: UIImage(systemName: symbol), style: .plain, target: self, action: action)
        }
        backItem = item("chevron.backward", #selector(goBack))
        forwardItem = item("chevron.forward", #selector(goForward))
        backItem.isEnabled = false
        forwardItem.isEnabled = false
        bgItem = UIBarButtonItem(title: nil, style: .plain, target: self, action: #selector(toggleBackground))
        updateBgItem()
        let flex = { UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil) }
        toolbar.items = [
            backItem, flex(), forwardItem, flex(),
            item("play.rectangle", #selector(goYouTube)), flex(),
            item("music.note", #selector(goMusic)), flex(),
            item("pip.enter", #selector(togglePip)), flex(),
            bgItem, flex(),
            item("arrow.clockwise", #selector(reload)),
        ]
    }

    private func updateBgItem() {
        bgItem.title = settings.backgroundPlay ? "BG 켬" : "BG 끔"
        bgItem.tintColor = settings.backgroundPlay ? Self.accent : .gray
    }

    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func goYouTube() { webView.load(URLRequest(url: Settings.homeYouTube)) }
    @objc private func goMusic() { webView.load(URLRequest(url: Settings.homeMusic)) }
    @objc private func reload() { webView.reload() }
    /// 사용자 탭에서 호출되므로 PiP 요청이 허용된다. PiP 는 iOS 가 공식 지원하는 백그라운드 영상 재생 경로.
    @objc private func togglePip() { command("pip") }

    @objc private func toggleBackground() {
        settings.backgroundPlay.toggle()
        installScript(on: webView.configuration.userContentController)
        updateBgItem()
        webView.reload()
    }

    // MARK: - 상단 바 / 보관함

    private func buildTopBar() {
        func button(_ title: String, accent: Bool = false, _ action: Selector) -> UIButton {
            let b = UIButton(type: .system)
            b.setTitle(title, for: .normal)
            b.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
            b.setTitleColor(accent ? Self.accent : .white, for: .normal)
            b.addTarget(self, action: action, for: .touchUpInside)
            return b
        }
        let name = UILabel()
        name.text = "BgPlay"
        name.font = .systemFont(ofSize: 15, weight: .bold)
        name.textColor = .gray
        // ① 탭 한 번 = 임시함 저장 (아무것도 묻지 않음). 길게 누르면 분류 시트.
        let quick = button("＋ 임시", accent: true, #selector(quickSaveTapped))
        quick.addGestureRecognizer(UILongPressGestureRecognizer(target: self, action: #selector(quickSaveLongPressed(_:))))
        // ② 분류 저장
        let classify = button("분류", #selector(classifyTapped))
        // ③ 보관함 (임시함 개수 표시)
        libraryButton = button("보관함", #selector(libraryTapped))
        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let views: [UIView] = [name, spacer, quick, classify, libraryButton]
        views.forEach { topBar.addArrangedSubview($0) }
        topBar.axis = .horizontal
        topBar.alignment = .center
        topBar.spacing = 18
    }

    private func wireLibrary() {
        library.onStats = { [weak self] inbox, _ in
            self?.libraryButton.setTitle(inbox > 0 ? "보관함 \(inbox)" : "보관함", for: .normal)
        }
        library.onPlay = { [weak self] url, _ in self?.playSingle(url) }
        library.onPlayQueue = { [weak self] name, items, index in self?.playQueue(name: name, items: items, index: index) }
        library.onToast = { [weak self] text in self?.snack.show(text) }
        library.onExport = { [weak self] json, filename in self?.export(json: json, filename: filename) }
    }

    @objc private func quickSaveTapped() {
        guard let track = currentTrack() else { return snack.show("저장할 영상이 없어요. 영상을 먼저 열어 주세요") }
        library.quickSave(track) { [weak self] r in
            guard let self else { return }
            let classify = { self.library.openSave(track) }
            switch r?["status"] as? String {
            case "added":
                self.snack.show("임시함에 저장했어요", action: "분류", classify)
            case "duplicate":
                let names = r?["where"] as? [String] ?? []
                self.snack.show(names.isEmpty ? "이미 임시함에 있어요" : "이미 저장됨 · " + names.joined(separator: ", "), action: "분류", classify)
            default:
                self.snack.show("저장할 영상이 없어요")
            }
        }
    }

    @objc private func quickSaveLongPressed(_ g: UILongPressGestureRecognizer) {
        if g.state == .began { classifyTapped() }
    }

    @objc private func classifyTapped() {
        guard let track = currentTrack() else { return snack.show("저장할 영상이 없어요. 영상을 먼저 열어 주세요") }
        library.openSave(track)
    }

    @objc private func libraryTapped() {
        library.openLibrary(nowPlaying: currentTrack())
    }

    /// 지금 보고 있는 영상 (보관함 track 형식). 영상 페이지가 아니면 nil.
    private func currentTrack() -> [String: Any]? {
        if let u = info.url, URLPolicy.videoId(of: u) != nil {
            var t: [String: Any] = ["url": u]
            if let v = info.title { t["title"] = v }
            if let v = info.artist { t["artist"] = v }
            if let v = info.artworkURL?.absoluteString { t["artwork"] = v }
            if let v = info.duration { t["duration"] = v }
            return t
        }
        if let u = webView.url?.absoluteString, URLPolicy.videoId(of: u) != nil {
            return ["url": u, "title": webView.title ?? ""]
        }
        return nil
    }

    private func export(json: String, filename: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do { try json.write(to: url, atomically: true, encoding: .utf8) } catch { return snack.show("내보내기 실패") }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = libraryButton
        present(vc, animated: true)
    }

    // MARK: - 재생 큐

    private func playSingle(_ url: URL) {
        clearQueue()
        webView.load(URLRequest(url: url))
    }

    private func playQueue(name: String, items: [LibraryOverlay.QueueItem], index: Int) {
        queue = items
        queueIndex = index
        queueName = name
        loadQueueItem()
    }

    private func clearQueue() {
        queue = []
        queueIndex = -1
        queueName = nil
        awaitingId = nil
    }

    /// 잠금화면/이어폰의 "다음": 큐가 있으면 큐, 없으면 사이트의 다음 곡.
    private func skipNext() {
        if queue.isEmpty { return command("next") }
        if hasQueueNext { queueIndex += 1; loadQueueItem() } else { clearQueue() }
    }

    private func skipPrev() {
        if !queue.isEmpty && queueIndex > 0 { queueIndex -= 1; loadQueueItem() } else { command("prev") }
    }

    private func loadQueueItem() {
        let item = queue[queueIndex]
        awaitingId = item.videoId
        awaitingSince = Date()
        webView.load(URLRequest(url: item.url))
    }

    /// 새 곡 로딩 중엔 무시 → 현재 곡이 끝나면 다음 → 사용자가 다른 영상으로 가면 큐 종료.
    /// ⚠️ iOS 는 백그라운드에서 새 페이지의 재생 시작이 막힐 수 있다 (TEST_PLAN 참고).
    private func advanceQueue(_ s: PlaybackInfo) {
        guard !queue.isEmpty else { return }
        let vid = URLPolicy.videoId(of: s.url)
        if let waiting = awaitingId {
            if vid == waiting || Date().timeIntervalSince(awaitingSince) > 20 { awaitingId = nil }
            return
        }
        if let vid, vid != queue[queueIndex].videoId {
            clearQueue()
        } else if vid == queue[queueIndex].videoId, s.ended {
            skipNext()
        }
    }

}

// MARK: - Bridge

extension PlayerViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // .page 월드라 어떤 페이지든 postMessage 를 부를 수 있다: 메인 프레임 + YouTube 출처만 받는다.
        guard message.frameInfo.isMainFrame,
              URLPolicy.isYouTube(host: message.frameInfo.securityOrigin.host),
              let body = message.body as? String,
              let data = body.data(using: .utf8),
              let m = try? JSONDecoder().decode(BridgeMessage.self, from: data) else { return }
        handle(m)
    }
}

/// WKUserContentController 가 핸들러를 강하게 잡아 생기는 순환 참조 방지.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}

// MARK: - Navigation

extension PlayerViewController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let scheme = url.scheme?.lowercased() ?? ""
        if URLPolicy.isInternal(url) || ["about", "blob", "data"].contains(scheme) {
            return decisionHandler(.allow)
        }
        decisionHandler(.cancel)
        // "앱에서 열기"(youtube://, vnd.youtube://, intent://)는 무시하고 이 앱에 머문다.
        if ["http", "https", "mailto", "tel"].contains(scheme), action.targetFrame?.isMainFrame ?? true {
            UIApplication.shared.open(url)
        }
    }

    /// target=_blank -> 같은 WebView 에서 연다.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil { webView.load(action.request) }
        return nil
    }

    /// WebContent 프로세스가 죽으면(메모리 압박 등) 다시 로드.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[BgPlay] WebContent process terminated; reloading")
        info = PlaybackInfo()
        nowPlaying.clear()
        webView.reload()
    }
}
