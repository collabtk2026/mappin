import UIKit

/// 화면 아래 짧은 알림 + 동작 버튼 ("임시함에 저장했어요 · 분류").
final class SnackBar: UIView {
    private let label = UILabel()
    private let button = UIButton(type: .system)
    private var action: (() -> Void)?
    private var hideWork: DispatchWorkItem?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(white: 0.18, alpha: 1)
        layer.cornerRadius = 12
        layer.shadowOpacity = 0.35
        layer.shadowRadius = 12
        layer.shadowOffset = CGSize(width: 0, height: 4)
        label.textColor = .white
        label.font = .systemFont(ofSize: 14)
        label.numberOfLines = 2
        button.setTitleColor(UIColor(red: 1, green: 0.31, blue: 0.27, alpha: 1), for: .normal)
        button.titleLabel?.font = .boldSystemFont(ofSize: 15)
        button.addTarget(self, action: #selector(tap), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [label, button])
        stack.spacing = 12
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
        ])
        button.setContentHuggingPriority(.required, for: .horizontal)
        alpha = 0
        isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func show(_ text: String, action title: String? = nil, _ handler: (() -> Void)? = nil) {
        label.text = text
        button.setTitle(title, for: .normal)
        button.isHidden = title == nil
        action = handler
        superview?.bringSubviewToFront(self)
        isHidden = false
        UIView.animate(withDuration: 0.2) { self.alpha = 1 }
        hideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.hide() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: work)
    }

    func hide() {
        UIView.animate(withDuration: 0.2, animations: { self.alpha = 0 }) { _ in self.isHidden = true }
    }

    @objc private func tap() {
        hide()
        action?()
    }
}
