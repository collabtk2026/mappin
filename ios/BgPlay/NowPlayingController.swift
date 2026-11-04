import MediaPlayer
import UIKit

/// 잠금화면 / 제어 센터 / 이어폰·CarPlay 버튼  <->  bgplay.js 명령.
final class NowPlayingController {
    /// (명령 이름, 인자) — PlayerViewController 가 window.__bgplay.command 로 전달.
    var onCommand: ((String, Double?) -> Void)?

    private var artworkURL: URL?
    private var artwork: MPMediaItemArtwork?
    private var artworkTask: URLSessionDataTask?
    private var lastInfo = PlaybackInfo()

    init() {
        let c = MPRemoteCommandCenter.shared()
        _ = c.playCommand.addTarget { [weak self] _ in self?.send("play"); return .success }
        _ = c.pauseCommand.addTarget { [weak self] _ in self?.send("pause"); return .success }
        _ = c.togglePlayPauseCommand.addTarget { [weak self] _ in self?.send("toggle"); return .success }
        _ = c.nextTrackCommand.addTarget { [weak self] _ in self?.send("next"); return .success }
        _ = c.previousTrackCommand.addTarget { [weak self] _ in self?.send("prev"); return .success }
        _ = c.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.send("seekto", e.positionTime)
            return .success
        }
        c.skipForwardCommand.isEnabled = false
        c.skipBackwardCommand.isEnabled = false
    }

    func update(_ info: PlaybackInfo) {
        lastInfo = info
        guard Settings.shared.nativeNowPlaying else { return }
        let c = MPRemoteCommandCenter.shared()
        c.nextTrackCommand.isEnabled = info.canNext
        c.previousTrackCommand.isEnabled = info.hasMedia
        c.changePlaybackPositionCommand.isEnabled = info.duration != nil

        var d: [String: Any] = [
            MPMediaItemPropertyTitle: info.title ?? "Youplay",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: info.position,
            MPNowPlayingInfoPropertyPlaybackRate: info.playing ? info.rate : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.video.rawValue,
        ]
        if let v = info.artist { d[MPMediaItemPropertyArtist] = v }
        if let v = info.album { d[MPMediaItemPropertyAlbumTitle] = v }
        if let v = info.duration { d[MPMediaItemPropertyPlaybackDuration] = v }
        if let url = info.artworkURL {
            if url == artworkURL, let art = artwork {
                d[MPMediaItemPropertyArtwork] = art
            } else {
                loadArtwork(url)
            }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = d
    }

    func clear() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func send(_ name: String, _ arg: Double? = nil) {
        DispatchQueue.main.async { self.onCommand?(name, arg) }
    }

    private func loadArtwork(_ url: URL) {
        if artworkTask?.originalRequest?.url == url { return }
        artworkTask?.cancel()
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard let self else { return }
                self.artworkURL = url
                self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                self.artworkTask = nil
                self.update(self.lastInfo)
            }
        }
        artworkTask?.resume()
    }
}
