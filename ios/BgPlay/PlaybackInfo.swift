import Foundation

/// bgplay.js 가 보내는 메시지 ({type:"state", ...} 등).
struct BridgeMessage: Decodable {
    let type: String
    var hasMedia: Bool?
    var playing: Bool?
    var ended: Bool?
    var position: Double?
    var duration: Double?
    var rate: Double?
    var title: String?
    var artist: String?
    var album: String?
    var artwork: String?
    var url: String?
    var canNext: Bool?
    var canPrev: Bool?
    var state: String?
}

struct PlaybackInfo {
    var hasMedia = false
    var playing = false
    var position: Double = 0
    var duration: Double?
    var rate: Double = 1
    var title: String?
    var artist: String?
    var album: String?
    var artworkURL: URL?
    var canNext = false
    var canPrev = false

    init() {}

    init(_ m: BridgeMessage) {
        hasMedia = m.hasMedia ?? false
        playing = m.playing ?? false
        position = m.position ?? 0
        duration = m.duration.flatMap { $0 > 0 ? $0 : nil }
        rate = m.rate ?? 1
        title = m.title
        artist = m.artist
        album = m.album
        artworkURL = m.artwork.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
        canNext = m.canNext ?? false
        canPrev = m.canPrev ?? false
    }
}
