import XCTest
@testable import SoomCore

final class PatternTests: XCTestCase {
    func testPresetsAreValidAndUnique() {
        XCTAssertEqual(Set(Presets.all.map(\.id)).count, Presets.all.count)
        for p in Presets.all {
            XCTAssertTrue(p.isValid, p.name)
            XCTAssertTrue(p.isBuiltIn)
            XCTAssertFalse(p.summary.isEmpty)
        }
    }

    func testRhythmText() {
        XCTAssertEqual(Presets.fourSevenEight.rhythmText, "4 · 7 · 8")
        XCTAssertEqual(Presets.coherent.rhythmText, "5.5 · 5.5")
        XCTAssertEqual(Presets.box.rhythmDetailText, "들숨 4 · 멈춤 4 · 날숨 4 · 멈춤 4")
        XCTAssertEqual(Presets.coherent.breathsPerMinute, 60 / 11, accuracy: 1e-9)
    }

    func testQuickEqualPatterns() {
        for s in Presets.quickSeconds {
            let p = Presets.equal(seconds: s)
            XCTAssertEqual(p.cycleDuration, Double(s * 2))
            XCTAssertEqual(Presets.builtIn(id: p.id), p)
            XCTAssertEqual(p.fourStep, FourStepDurations(inhale: Double(s), holdIn: 0, exhale: Double(s), holdOut: 0))
        }
        XCTAssertNil(Presets.builtIn(id: "nope"))
    }

    func testSimpleFourStep() {
        XCTAssertTrue(Presets.box.isSimpleFourStep)
        XCTAssertTrue(Presets.fourSevenEight.isSimpleFourStep)
        XCTAssertTrue(Presets.equal.isSimpleFourStep)
        XCTAssertFalse(Presets.cyclicSigh.isSimpleFourStep) // 들숨이 두 번
    }

    func testFourStepClamping() {
        var d = FourStepDurations(inhale: 4, holdIn: 0, exhale: 4, holdOut: 0)
        d[.inhale] = 0
        XCTAssertEqual(d.inhale, 1)
        d[.holdIn] = -2
        XCTAssertEqual(d.holdIn, 0)
        d[.exhale] = 99
        XCTAssertEqual(d.exhale, 20)
    }

    func testSessionLengthCycles() {
        XCTAssertEqual(SessionLength.minutes(1).cycleCount(for: Presets.equal), 8)       // 60 / 8 = 7.5 → 8
        XCTAssertEqual(SessionLength.minutes(5).cycleCount(for: Presets.box), 19)        // 300 / 16 = 18.75
        XCTAssertEqual(SessionLength.minutes(1).cycleCount(for: Presets.fourSevenEight), 3)
        XCTAssertEqual(SessionLength.cycles(4).cycleCount(for: Presets.box), 4)
        XCTAssertNil(SessionLength.unlimited.cycleCount(for: Presets.box))
    }

    func testCodableRoundTrip() throws {
        let data = try JSONEncoder().encode(Presets.all)
        let decoded = try JSONDecoder().decode([BreathingPattern].self, from: data)
        XCTAssertEqual(decoded, Presets.all)
    }

    func testPreferencesDecodeWithMissingKeys() throws {
        let json = #"{"theme":"forest","sessionLength":{"cycles":{"_0":10}}}"#.data(using: .utf8)!
        let p = try JSONDecoder().decode(Preferences.self, from: json)
        XCTAssertEqual(p.theme, .forest)
        XCTAssertEqual(p.sessionLength, .cycles(10))
        XCTAssertEqual(p.voiceMode, .firstCycles)
        XCTAssertEqual(p.selectedPatternID, Presets.default.id)

        var q = Preferences()
        q.ambient = .ocean
        q.sessionLength = .unlimited
        let back = try JSONDecoder().decode(Preferences.self, from: JSONEncoder().encode(q))
        XCTAssertEqual(back, q)
    }

    func testVoiceMode() {
        XCTAssertTrue(VoiceMode.firstCycles.shouldSpeak(cycle: 2))
        XCTAssertFalse(VoiceMode.firstCycles.shouldSpeak(cycle: 3))
        XCTAssertFalse(VoiceMode.off.shouldSpeak(cycle: 0))
    }

    func testDurationText() {
        XCTAssertEqual(TimeInterval(125).clockText, "2:05")
        XCTAssertEqual(TimeInterval(125).koreanDurationText, "2분 5초")
        XCTAssertEqual(TimeInterval(40).koreanDurationText, "40초")
        XCTAssertEqual(TimeInterval(600).koreanDurationText, "10분")
    }
}
