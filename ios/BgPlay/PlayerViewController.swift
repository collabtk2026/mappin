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

        nowPlaying.onCommand = { [weak self] name, arg in self?.command(name, arg) }
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
            if info.playing { audio.activate() }
            if info.hasMedia { nowPlaying.update(info) } else { nowPlaying.clear() }
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
        toolbar.barStyle = .black
        toolbar.tintColor = .white
        view.addSubview(webView)
        view.addSubview(toolbar)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
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
        bgItem.tintColor = settings.backgroundPlay ? UIColor(red: 1, green: 0.31, blue: 0.27, alpha: 1) : .gray
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
