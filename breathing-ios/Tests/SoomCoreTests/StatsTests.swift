import XCTest
@testable import SoomCore

final class StatsTests: XCTestCase {
    var cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }()

    func day(_ d: Int, _ h: Int = 9) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 11, day: d, hour: h))!
    }

    func record(_ date: Date, minutes: Double = 5, name: String = "박스 호흡") -> SessionRecord {
        SessionRecord(patternID: "x", patternName: name, rhythmText: "", startDate: date, duration: minutes * 60, cycles: 10, completed: true)
    }

    func testStreak() {
        let records = [record(day(1)), record(day(2)), record(day(3)), record(day(3, 21)), record(day(5))]
        XCTAssertEqual(Stats.streak(records, now: day(5, 22), calendar: cal), 1)
        XCTAssertEqual(Stats.streak(records, now: day(3, 23), calendar: cal), 3)
        // 오늘(4일) 아직 안 했어도 어제까지 이어진 기록은 유지
        XCTAssertEqual(Stats.streak(records, now: day(4, 8), calendar: cal), 3)
        XCTAssertEqual(Stats.streak(records, now: day(7), calendar: cal), 0)
        XCTAssertEqual(Stats.streak([], calendar: cal), 0)
        XCTAssertEqual(Stats.longestStreak(records, calendar: cal), 3)
    }

    func testDailyMinutes() {
        let records = [record(day(3), minutes: 3), record(day(3, 20), minutes: 2), record(day(1), minutes: 10)]
        let week = Stats.dailyMinutes(records, days: 7, now: day(4), calendar: cal)
        XCTAssertEqual(week.count, 7)
        XCTAssertEqual(week.last?.day, cal.startOfDay(for: day(4)))
        XCTAssertEqual(week[5].minutes, 5, accuracy: 1e-9)  // 3일
        XCTAssertEqual(week[3].minutes, 10, accuracy: 1e-9) // 1일
        XCTAssertEqual(week[6].minutes, 0)
        XCTAssertEqual(Stats.totalMinutes(records), 15, accuracy: 1e-9)
    }

    func testFavorite() {
        let records = [record(day(1), name: "A"), record(day(2), name: "B"), record(day(3), name: "B")]
        XCTAssertEqual(Stats.favoritePatternName(records), "B")
        XCTAssertNil(Stats.favoritePatternName([]))
    }
}
