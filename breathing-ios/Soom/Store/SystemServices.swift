import Foundation
import HealthKit
import UserNotifications

/// Apple 건강 앱의 '마음챙김' 시간 기록
final class HealthKitManager {
    static let shared = HealthKitManager()

    private let store = HKHealthStore()
    private var mindfulType: HKCategoryType? { HKObjectType.categoryType(forIdentifier: .mindfulSession) }

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// 권한을 요청하고, 쓰기가 허용됐는지 돌려준다.
    func requestAuthorization() async -> Bool {
        guard isAvailable, let type = mindfulType else { return false }
        do {
            try await store.requestAuthorization(toShare: [type], read: [])
            return store.authorizationStatus(for: type) == .sharingAuthorized
        } catch {
            return false
        }
    }

    func saveMindfulSession(start: Date, end: Date) async {
        guard isAvailable, let type = mindfulType, store.authorizationStatus(for: type) == .sharingAuthorized else { return }
        let sample = HKCategorySample(type: type, value: HKCategoryValue.notApplicable.rawValue, start: start, end: end)
        try? await store.save(sample)
    }
}

/// 매일 호흡 알림
enum ReminderManager {
    private static let identifier = "soom.daily.reminder"

    private static let messages = [
        "잠시 멈추고, 천천히 숨 쉬어 볼까요?",
        "1분이면 충분해요. 숨을 고르는 시간이에요.",
        "오늘 하루도 수고했어요. 깊게 한 번 내쉬어요.",
        "어깨에 힘을 빼고, 숨에 집중해 보세요.",
    ]

    static func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        return granted
    }

    static func schedule(hour: Int, minute: Int) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])

        let content = UNMutableNotificationContent()
        content.title = "숨 고를 시간"
        content.body = messages.randomElement() ?? messages[0]
        content.sound = .default

        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }

    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }
}
