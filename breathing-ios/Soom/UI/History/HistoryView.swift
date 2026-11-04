import Charts
import SwiftUI

/// 기록 탭: 연속 일수, 주간 그래프, 세션 목록
struct HistoryView: View {
    @Environment(HistoryStore.self) private var history
    @Environment(AppRouter.self) private var router
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("기록")
                        .font(.largeTitle.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.top, 12)

                    if history.records.isEmpty {
                        emptyState
                    } else {
                        stats
                        weeklyChart
                        sessionList
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(ThemedBackground())
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(theme.accent)
            Text("아직 기록이 없어요")
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            Text("호흡을 마치면 이곳에 시간과 기분이 쌓여요.\n오늘 첫 호흡을 시작해 볼까요?")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.65))
            Button {
                router.tab = .breathe
            } label: {
                Label("호흡하러 가기", systemImage: "wind")
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.top, 8)
        }
        .padding(28)
        .frame(maxWidth: .infinity)
        .glassCard(cornerRadius: 28)
        .padding(.top, 40)
    }

    private var stats: some View {
        let records = history.records
        let weekStart = Calendar.current.date(byAdding: .day, value: -6, to: Calendar.current.startOfDay(for: Date())) ?? Date()
        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                StatTile(value: "\(history.streak)일", label: "연속 실천", symbol: "flame.fill", tint: Color(hex: 0xFFB36B))
                StatTile(value: "\(Int(Stats.minutes(records, since: weekStart).rounded()))분", label: "최근 7일", symbol: "calendar", tint: theme.accent)
            }
            HStack(spacing: 12) {
                StatTile(value: "\(records.count)회", label: "전체 세션", symbol: "wind", tint: theme.accent)
                StatTile(value: totalTimeText(Stats.totalMinutes(records)), label: "전체 시간", symbol: "hourglass", tint: theme.accent)
            }
            if let favorite = Stats.favoritePatternName(records) {
                HStack {
                    Label("가장 많이 한 호흡", systemImage: "star.fill")
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer()
                    Text(favorite)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                }
                .font(.subheadline)
                .padding(16)
                .glassCard(cornerRadius: 18)

                HStack {
                    Label("최장 연속 기록", systemImage: "trophy.fill")
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer()
                    Text("\(Stats.longestStreak(records))일")
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                }
                .font(.subheadline)
                .padding(16)
                .glassCard(cornerRadius: 18)
            }
        }
    }

    private func totalTimeText(_ minutes: Double) -> String {
        let m = Int(minutes.rounded())
        if m >= 60 { return "\(m / 60)시간 \(m % 60)분" }
        return "\(m)분"
    }

    private var weeklyChart: some View {
        let days = Stats.dailyMinutes(history.records, days: 7)
        return VStack(alignment: .leading, spacing: 14) {
            SectionTitle(title: "이번 주 호흡", caption: "하루 몇 분씩 숨을 골랐는지 보여줘요")
            Chart(days) { day in
                BarMark(
                    x: .value("날짜", day.day, unit: .day),
                    y: .value("분", day.minutes)
                )
                .foregroundStyle(
                    LinearGradient(colors: [theme.orb[0], theme.orb[2]], startPoint: .top, endPoint: .bottom)
                )
                .cornerRadius(6)
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day)) { _ in
                    AxisValueLabel(format: .dateTime.weekday(.narrow), centered: true)
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisGridLine().foregroundStyle(.white.opacity(0.08))
                    AxisValueLabel().foregroundStyle(.white.opacity(0.5))
                }
            }
            .frame(height: 180)
            .accessibilityLabel("최근 7일 호흡 시간 그래프")
        }
        .padding(18)
        .glassCard(cornerRadius: 24)
    }

    private var sessionList: some View {
        let groups = Dictionary(grouping: history.sorted) { Calendar.current.startOfDay(for: $0.startDate) }
        let days = groups.keys.sorted(by: >)
        return VStack(alignment: .leading, spacing: 16) {
            SectionTitle(title: "지난 세션", caption: "길게 누르면 삭제할 수 있어요")
            ForEach(days, id: \.self) { day in
                VStack(alignment: .leading, spacing: 8) {
                    Text(dayTitle(day))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.55))
                    ForEach(groups[day] ?? []) { record in
                        SessionRow(record: record)
                            .contextMenu {
                                Button(role: .destructive) {
                                    withAnimation { history.delete(ids: [record.id]) }
                                } label: {
                                    Label("기록 삭제", systemImage: "trash")
                                }
                            }
                    }
                }
            }
        }
    }

    private func dayTitle(_ day: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(day) { return "오늘" }
        if cal.isDateInYesterday(day) { return "어제" }
        return day.formatted(.dateTime.month(.wide).day().weekday(.wide).locale(Locale(identifier: "ko_KR")))
    }
}

struct SessionRow: View {
    let record: SessionRecord
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: record.completed ? "checkmark.circle.fill" : "circle.dashed")
                .font(.title3)
                .foregroundStyle(record.completed ? theme.accent : .white.opacity(0.4))
            VStack(alignment: .leading, spacing: 3) {
                Text(record.patternName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                Text("\(record.startDate.formatted(date: .omitted, time: .shortened)) · \(record.duration.koreanDurationText) · \(record.cycles)회")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
            Spacer()
            if let mood = record.mood {
                Text(mood.emoji)
                    .font(.title3)
                    .accessibilityLabel("기분 \(mood.label)")
            }
        }
        .padding(14)
        .glassCard(cornerRadius: 18)
        .accessibilityElement(children: .combine)
    }
}
