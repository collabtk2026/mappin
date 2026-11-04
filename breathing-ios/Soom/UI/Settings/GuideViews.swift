import SwiftUI

/// 안전하게 호흡하기
struct SafetyView: View {
    @Environment(\.theme) private var theme

    private let items: [(String, String, String)] = [
        ("figure.mind.and.body", "편한 자세로", "의자에 앉거나 누운 자세에서 하세요. 어깨와 턱의 힘을 빼고, 가능하면 코로 숨 쉬세요."),
        ("exclamationmark.triangle", "어지러우면 멈추기", "머리가 핑 돌거나 손발이 저리면 바로 멈추고 평소처럼 숨 쉬세요. 숨 참기 시간을 줄이거나 없애도 좋습니다."),
        ("car", "운전·수영 중에는 금지", "운전, 기계 조작, 물속이나 욕조 안에서는 호흡 훈련을 하지 마세요."),
        ("heart", "건강 상태 확인", "임신 중이거나 심장 질환, 고혈압, 녹내장, 공황장애, 호흡기 질환이 있다면 숨 참기가 긴 호흡(4-7-8, 박스 호흡)은 의사와 상의 후 하세요."),
        ("tortoise", "천천히 늘리기", "처음에는 1~3분, 짧은 리듬으로 시작해 익숙해지면 조금씩 늘리세요. 억지로 길게 할 필요는 없습니다."),
        ("cross.case", "치료를 대신하지 않아요", "이 앱은 휴식과 마음 관리를 돕는 도구이며, 의학적 진단이나 치료를 대신하지 않습니다."),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(items.indices, id: \.self) { index in
                    let item = items[index]
                    HStack(alignment: .top, spacing: 14) {
                        Image(systemName: item.0)
                            .font(.title3)
                            .foregroundStyle(theme.accent)
                            .frame(width: 32)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.1)
                                .font(.headline)
                                .foregroundStyle(.white)
                            Text(item.2)
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.75))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(16)
                    .glassCard(cornerRadius: 20)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(20)
        }
        .background(ThemedBackground())
        .navigationTitle("안전하게 호흡하기")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// 호흡법 모음과 근거
struct GuideView: View {
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("왜 천천히 숨 쉬면 편안해질까요?")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                    Text("숨을 천천히, 특히 길게 내쉬면 미주신경을 통해 부교감신경이 활성화되어 심박이 느려지고 몸이 쉬는 상태로 바뀝니다. 분당 5~6회 정도의 느린 호흡은 심박변이도(HRV)를 높이고 불안·스트레스를 줄이는 데 도움이 된다는 연구가 많습니다.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(18)
                .glassCard(cornerRadius: 22)

                ForEach(Presets.all) { pattern in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: pattern.symbol)
                                .foregroundStyle(pattern.category.tint(theme))
                            Text(pattern.name)
                                .font(.headline)
                                .foregroundStyle(.white)
                            Spacer()
                            Text(pattern.rhythmText)
                                .font(.subheadline.weight(.semibold))
                                .monospacedDigit()
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        Text(pattern.summary)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.75))
                            .fixedSize(horizontal: false, vertical: true)
                        if let source = pattern.source {
                            Label(source, systemImage: "book.closed")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }
                    .padding(16)
                    .glassCard(cornerRadius: 20)
                }
            }
            .padding(20)
        }
        .background(ThemedBackground())
        .navigationTitle("호흡법과 근거")
        .navigationBarTitleDisplayMode(.inline)
    }
}
