import XCTest
@testable import SoomCore

final class TimelineTests: XCTestCase {
    func testBoxBreathingPhases() {
        let t = SessionTimeline(pattern: Presets.box, cycles: 2)
        XCTAssertEqual(t.cycleDuration, 16)
        XCTAssertEqual(t.totalDuration, 32)

        XCTAssertEqual(t.snapshot(at: 0).phase.kind, .inhale)
        XCTAssertEqual(t.snapshot(at: 3.99).phase.kind, .inhale)
        XCTAssertEqual(t.snapshot(at: 4).phase.kind, .holdIn)
        XCTAssertEqual(t.snapshot(at: 8.5).phase.kind, .exhale)
        XCTAssertEqual(t.snapshot(at: 12).phase.kind, .holdOut)

        let second = t.snapshot(at: 17)
        XCTAssertEqual(second.cycleIndex, 1)
        XCTAssertEqual(second.phase.kind, .inhale)
        XCTAssertEqual(second.phaseElapsed, 1, accuracy: 1e-9)
        XCTAssertFalse(second.isComplete)
    }

    func testLevelsFollowBreath() {
        let t = SessionTimeline(pattern: Presets.box, cycles: 1)
        XCTAssertEqual(t.snapshot(at: 0).level, 0, accuracy: 1e-9)
        XCTAssertEqual(t.snapshot(at: 2).level, 0.5, accuracy: 1e-9)
        XCTAssertEqual(t.snapshot(at: 5).level, 1, accuracy: 1e-9)   // 들숨 후 멈춤: 가득
        XCTAssertEqual(t.snapshot(at: 10).level, 0.5, accuracy: 1e-9) // 날숨 중간
        XCTAssertEqual(t.snapshot(at: 14).level, 0, accuracy: 1e-9)  // 날숨 후 멈춤: 비움
    }

    func testCompletion() {
        let t = SessionTimeline(pattern: Presets.equal, cycles: 3)
        let end = t.snapshot(at: 100)
        XCTAssertTrue(end.isComplete)
        XCTAssertEqual(end.cycleIndex, 2)
        XCTAssertEqual(end.totalProgress, 1)
        XCTAssertEqual(end.phase.kind, .exhale)

        let exact = t.snapshot(at: 24)
        XCTAssertTrue(exact.isComplete)
        XCTAssertEqual(exact.cycleIndex, 2)
        XCTAssertFalse(t.snapshot(at: 23.9).isComplete)
    }

    func testUnlimited() {
        let t = SessionTimeline(pattern: Presets.equal, cycles: nil)
        XCTAssertTrue(t.isUnlimited)
        let s = t.snapshot(at: 8 * 1000 + 5)
        XCTAssertEqual(s.cycleIndex, 1000)
        XCTAssertEqual(s.phase.kind, .exhale)
        XCTAssertNil(s.totalProgress)
        XCTAssertFalse(s.isComplete)
    }

    func testCyclicSighDoubleInhale() {
        let t = SessionTimeline(pattern: Presets.cyclicSigh, cycles: 1)
        let firstEnd = t.snapshot(at: 2.49)
        XCTAssertEqual(firstEnd.phaseIndex, 0)
        XCTAssertEqual(firstEnd.level, 0.75, accuracy: 0.01)
        let topUp = t.snapshot(at: 3)
        XCTAssertEqual(topUp.phaseIndex, 1)
        XCTAssertEqual(topUp.phase.instruction, "한 번 더")
        XCTAssertGreaterThan(topUp.level, 0.75)
        XCTAssertEqual(t.snapshot(at: 3.5).level, 1, accuracy: 1e-9)
    }

    func testZeroLengthPhasesAreSkipped() {
        let p = BreathingPattern(name: "t", phases: FourStepDurations(inhale: 4, holdIn: 0, exhale: 6, holdOut: 0).phases)
        XCTAssertEqual(p.activePhases.count, 2)
        XCTAssertEqual(p.rhythmText, "4 · 6")
        let t = SessionTimeline(pattern: p, cycles: 1)
        XCTAssertEqual(t.snapshot(at: 4).phase.kind, .exhale)
    }

    func testCountdownValue() {
        let t = SessionTimeline(pattern: Presets.fourSevenEight, cycles: 1)
        XCTAssertEqual(t.snapshot(at: 0).countdownValue, 4)
        XCTAssertEqual(t.snapshot(at: 0.5).countdownValue, 4)
        XCTAssertEqual(t.snapshot(at: 3.5).countdownValue, 1)
        XCTAssertEqual(t.snapshot(at: 4).countdownValue, 7)
    }
}
