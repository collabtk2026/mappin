import Foundation
import Observation

/// Application Support 폴더에 JSON으로 저장/읽기
enum JSONFile {
    static func url(_ name: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(name)
    }

    static func load<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(T.self, from: data)
    }

    static func save<T: Encodable>(_ value: T, to name: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(value) else { return }
        try? data.write(to: url(name), options: [.atomic])
    }
}

/// 사용자 설정
@Observable
final class SettingsStore {
    var prefs: Preferences {
        didSet {
            guard prefs != oldValue else { return }
            JSONFile.save(prefs, to: "preferences.json")
        }
    }

    init() {
        prefs = JSONFile.load(Preferences.self, from: "preferences.json") ?? Preferences()
    }
}

/// 사용자가 만든 호흡 패턴
@Observable
final class PatternStore {
    private(set) var custom: [BreathingPattern] {
        didSet { JSONFile.save(custom, to: "patterns.json") }
    }

    init() {
        custom = JSONFile.load([BreathingPattern].self, from: "patterns.json") ?? []
    }

    var all: [BreathingPattern] { Presets.all + custom }

    func pattern(id: String) -> BreathingPattern? {
        custom.first { $0.id == id } ?? Presets.builtIn(id: id)
    }

    func patterns(in category: PatternCategory) -> [BreathingPattern] {
        category == .custom ? custom : Presets.all.filter { $0.category == category }
    }

    func upsert(_ pattern: BreathingPattern) {
        var p = pattern
        p.isBuiltIn = false
        p.category = .custom
        if let i = custom.firstIndex(where: { $0.id == p.id }) {
            custom[i] = p
        } else {
            custom.append(p)
        }
    }

    func delete(id: String) {
        custom.removeAll { $0.id == id }
    }

    /// 기본 패턴을 내 패턴으로 복사
    func duplicate(_ source: BreathingPattern) -> BreathingPattern {
        var copy = source
        copy.id = UUID().uuidString
        copy.name = source.name + " (내 버전)"
        copy.phases = source.fourStep.phases
        copy.isBuiltIn = false
        copy.category = .custom
        upsert(copy)
        return copy
    }
}

/// 완료한 세션 기록
@Observable
final class HistoryStore {
    private(set) var records: [SessionRecord] {
        didSet { JSONFile.save(records, to: "history.json") }
    }

    init() {
        records = JSONFile.load([SessionRecord].self, from: "history.json") ?? []
    }

    /// 최신순
    var sorted: [SessionRecord] { records.sorted { $0.startDate > $1.startDate } }

    func add(_ record: SessionRecord) {
        records.append(record)
    }

    func setMood(_ mood: Mood?, for id: UUID) {
        guard let i = records.firstIndex(where: { $0.id == id }) else { return }
        records[i].mood = mood
    }

    func delete(ids: Set<UUID>) {
        records.removeAll { ids.contains($0.id) }
    }

    func deleteAll() {
        records.removeAll()
    }

    var streak: Int { Stats.streak(records) }
}
