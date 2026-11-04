import Foundation

/// 세션이 끝난 뒤의 기분
enum Mood: Int, Codable, CaseIterable, Identifiable, Sendable {
    case tense = 1, uneasy, neutral, good, calm

    var id: Int { rawValue }

    var emoji: String {
        switch self {
        case .tense: return "😣"
        case .uneasy: return "😕"
        case .neutral: return "😐"
        case .good: return "🙂"
        case .calm: return "😌"
        }
    }

    var label: String {
        switch self {
        case .tense: return "긴장"
        case .uneasy: return "불편"
        case .neutral: return "보통"
        case .good: return "좋음"
        case .calm: return "평온"
        }
    }
}

/// 완료한 호흡 세션 기록
struct SessionRecord: Codable, Hashable, Identifiable, Sendable {
    var id: UUID
    var patternID: String
    var patternName: String
    var rhythmText: String
    var startDate: Date
    var duration: TimeInterval
    var cycles: Int
    var completed: Bool
    var mood: Mood?

    init(id: UUID = UUID(), patternID: String, patternName: String, rhythmText: String,
         startDate: Date, duration: TimeInterval, cycles: Int, completed: Bool, mood: Mood? = nil) {
        self.id = id
        self.patternID = patternID
        self.patternName = patternName
        self.rhythmText = rhythmText
        self.startDate = startDate
        self.duration = duration
        self.cycles = cycles
        self.completed = completed
        self.mood = mood
    }

    var endDate: Date { startDate.addingTimeInterval(duration) }
}

/// 기록 통계 계산 (순수 함수)
enum Stats {
    struct DayTotal: Identifiable, Hashable, Sendable {
        var day: Date
        var minutes: Double
        var id: Date { day }
    }

    /// 오늘(또는 어제)부터 거꾸로 이어진 연속 실천 일수
    static func streak(_ records: [SessionRecord], now: Date = Date(), calendar: Calendar = .current) -> Int {
        let days = Set(records.map { calendar.startOfDay(for: $0.startDate) })
        guard !days.isEmpty else { return 0 }
        var day = calendar.startOfDay(for: now)
        // 오늘 아직 안 했으면 어제부터 센다 (연속 기록이 오늘 끊기지 않도록)
        if !days.contains(day) {
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: day), days.contains(yesterday) else { return 0 }
            day = yesterday
        }
        var count = 0
        while days.contains(day) {
            count += 1
            guard let prev = calendar.date(byAdding: .day, value: -1, to: day) else { break }
            day = prev
        }
        return count
    }

    /// 가장 길었던 연속 실천 일수
    static func longestStreak(_ records: [SessionRecord], calendar: Calendar = .current) -> Int {
        let days = Set(records.map { calendar.startOfDay(for: $0.startDate) }).sorted()
        var best = 0, current = 0
        var previous: Date?
        for day in days {
            if let previous, let next = calendar.date(byAdding: .day, value: 1, to: previous), calendar.isDate(next, inSameDayAs: day) {
                current += 1
            } else {
                current = 1
            }
            best = max(best, current)
            previous = day
        }
        return best
    }

    /// 최근 n일의 날짜별 호흡 시간(분). 오래된 날짜부터.
    static func dailyMinutes(_ records: [SessionRecord], days: Int = 7, now: Date = Date(), calendar: Calendar = .current) -> [DayTotal] {
        let today = calendar.startOfDay(for: now)
        var totals: [Date: Double] = [:]
        for r in records {
            totals[calendar.startOfDay(for: r.startDate), default: 0] += r.duration / 60
        }
        return (0..<days).reversed().compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { return nil }
            return DayTotal(day: day, minutes: totals[day] ?? 0)
        }
    }

    static func totalMinutes(_ records: [SessionRecord]) -> Double {
        records.reduce(0) { $0 + $1.duration } / 60
    }

    static func minutes(_ records: [SessionRecord], since start: Date) -> Double {
        records.filter { $0.startDate >= start }.reduce(0) { $0 + $1.duration } / 60
    }

    /// 가장 많이 한 호흡법 이름
    static func favoritePatternName(_ records: [SessionRecord]) -> String? {
        let counts = Dictionary(grouping: records, by: \.patternName).mapValues(\.count)
        return counts.max { a, b in a.value == b.value ? a.key > b.key : a.value < b.value }?.key
    }
}
