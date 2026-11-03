import AVFoundation

/// 백그라운드 재생의 OS 레이어 (iOS).
/// UIBackgroundModes=audio + .playback 카테고리 + 활성 세션이 있어야 WebKit 의 미디어 재생이
/// 앱이 백그라운드/잠금 상태가 돼도 시스템에 의해 정지되지 않는다.
final class AudioSessionManager: NSObject {
    static let shared = AudioSessionManager()

    /// began=true: 전화/알람 등으로 중단됨. began=false: 끝남(shouldResume: 시스템이 재개 권장).
    var onInterruption: ((_ began: Bool, _ shouldResume: Bool) -> Void)?
    /// 이어폰/블루투스가 빠짐 -> 정지해야 함.
    var onRouteLost: (() -> Void)?

    private let session = AVAudioSession.sharedInstance()
    private(set) var isActive = false

    private override init() {
        super.init()
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(interruption(_:)),
                       name: AVAudioSession.interruptionNotification, object: session)
        nc.addObserver(self, selector: #selector(routeChange(_:)),
                       name: AVAudioSession.routeChangeNotification, object: session)
        nc.addObserver(self, selector: #selector(mediaServicesReset(_:)),
                       name: AVAudioSession.mediaServicesWereResetNotification, object: session)
    }

    func configure() {
        do {
            try session.setCategory(.playback, mode: .moviePlayback, options: [])
        } catch {
            NSLog("[BgPlay] setCategory failed: \(error)")
        }
    }

    func activate() {
        guard !isActive else { return }
        do {
            try session.setActive(true)
            isActive = true
        } catch {
            NSLog("[BgPlay] setActive failed: \(error)")
        }
    }

    @objc private func interruption(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            isActive = false
            onInterruption?(true, false)
        case .ended:
            let opts = (n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
            if opts.contains(.shouldResume) { activate() }
            onInterruption?(false, opts.contains(.shouldResume))
        @unknown default:
            break
        }
    }

    @objc private func routeChange(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        if reason == .oldDeviceUnavailable {
            DispatchQueue.main.async { self.onRouteLost?() }
        }
    }

    @objc private func mediaServicesReset(_ n: Notification) {
        isActive = false
        configure()
    }
}
