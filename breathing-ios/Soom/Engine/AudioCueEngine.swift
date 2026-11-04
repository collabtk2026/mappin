import AVFoundation

/// 신호음, 음성 안내, 배경 소리를 담당한다.
/// 소리 파일 없이 사인파와 노이즈를 직접 합성하므로 리소스가 필요 없다.
final class AudioCueEngine {
    enum Cue: CaseIterable {
        case inhale, exhale, hold, topUp, tick, finish
    }

    private let engine = AVAudioEngine()
    private let cuePlayer = AVAudioPlayerNode()
    private let noiseNode: AVAudioSourceNode
    private let noise: NoiseGenerator
    private let format: AVAudioFormat
    private let synthesizer = AVSpeechSynthesizer()
    private var buffers: [Cue: AVAudioPCMBuffer] = [:]
    private var isConfigured = false
    private var stopWorkItem: DispatchWorkItem?
    private var holdsSession = false
    /// 오디오 세션을 쓰고 있는 엔진 수. 앞 세션의 정리가 다음 세션 소리를 끄지 않도록 센다. (메인 스레드 전용)
    private static var sessionUsers = 0

    var cueVolume: Float = 0.7 {
        didSet { cuePlayer.volume = cueVolume }
    }

    init() {
        let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        let generator = NoiseGenerator(sampleRate: format.sampleRate)
        self.format = format
        self.noise = generator
        self.noiseNode = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            for frame in 0..<Int(frameCount) {
                let sample = generator.nextSample()
                for buffer in buffers {
                    buffer.mData?.assumingMemoryBound(to: Float.self)[frame] = sample
                }
            }
            return noErr
        }
    }

    /// 오디오 세션을 켜고 엔진을 시작한다. 여러 번 불러도 안전하다.
    func start() {
        stopWorkItem?.cancel()
        stopWorkItem = nil

        let session = AVAudioSession.sharedInstance()
        // 다른 앱 음악과 함께 들을 수 있고, 무음 스위치와 잠금 화면에서도 안내가 나온다.
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
        if !holdsSession {
            holdsSession = true
            Self.sessionUsers += 1
        }

        if !isConfigured {
            engine.attach(cuePlayer)
            engine.attach(noiseNode)
            engine.connect(cuePlayer, to: engine.mainMixerNode, format: format)
            engine.connect(noiseNode, to: engine.mainMixerNode, format: format)
            for cue in Cue.allCases {
                buffers[cue] = makeBuffer(for: cue)
            }
            cuePlayer.volume = cueVolume
            isConfigured = true
        }
        if !engine.isRunning {
            engine.prepare()
            try? engine.start()
        }
        if engine.isRunning, !cuePlayer.isPlaying {
            cuePlayer.play()
        }
    }

    var isRunning: Bool { engine.isRunning }

    func play(_ cue: Cue) {
        guard let buffer = buffers[cue] else { return }
        if !engine.isRunning { start() }
        guard engine.isRunning else { return }
        if !cuePlayer.isPlaying { cuePlayer.play() }
        cuePlayer.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
    }

    func speak(_ text: String, volume: Float) {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
        utterance.rate = 0.42
        utterance.pitchMultiplier = 0.95
        utterance.volume = volume
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .word)
        }
    }

    /// 배경 소리 종류와 음량. 음량은 부드럽게 바뀐다.
    func setAmbient(_ sound: AmbientSound, volume: Float) {
        if sound != .none, !engine.isRunning { start() }
        noise.setKind(sound)
        noise.targetGain = sound == .none ? 0 : volume
    }

    /// 배경 소리를 줄이고 잠시 뒤 엔진을 멈춘다.
    func fadeOutAndStop(after delay: TimeInterval) {
        noise.targetGain = 0
        stopWorkItem?.cancel()
        let item = DispatchWorkItem { [self] in
            self.stopNow()
        }
        stopWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }

    func stopNow() {
        stopWorkItem?.cancel()
        stopWorkItem = nil
        synthesizer.stopSpeaking(at: .immediate)
        cuePlayer.stop()
        engine.stop()
        guard holdsSession else { return }
        holdsSession = false
        Self.sessionUsers = max(0, Self.sessionUsers - 1)
        if Self.sessionUsers == 0 {
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        }
    }

    // MARK: - 신호음 합성

    private func makeBuffer(for cue: Cue) -> AVAudioPCMBuffer? {
        let freqs: [Double]
        let duration: Double
        let decay: Double
        let amplitude: Double
        switch cue {
        case .inhale: freqs = [659.25]; duration = 1.8; decay = 0.6; amplitude = 0.32           // E5, 맑게
        case .exhale: freqs = [440.0]; duration = 2.2; decay = 0.8; amplitude = 0.34            // A4, 따뜻하게
        case .hold: freqs = [880.0]; duration = 0.9; decay = 0.25; amplitude = 0.16             // A5, 짧고 작게
        case .topUp: freqs = [783.99]; duration = 0.7; decay = 0.18; amplitude = 0.18           // G5
        case .tick: freqs = [1046.5]; duration = 0.25; decay = 0.05; amplitude = 0.22           // C6, 카운트다운
        case .finish: freqs = [523.25, 659.25, 783.99]; duration = 3.6; decay = 1.3; amplitude = 0.36 // C 장화음
        }

        let sampleRate = format.sampleRate
        let frameCount = AVAudioFrameCount(duration * sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
              let data = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frameCount

        let twoPi = 2 * Double.pi
        for i in 0..<Int(frameCount) {
            let t = Double(i) / sampleRate
            let attack = min(1, t / 0.012)
            let release = min(1, (duration - t) / 0.06)
            let envelope = attack * release * exp(-t / decay)
            var sample = 0.0
            for f in freqs {
                // 기본음 + 배음을 조금 섞어 싱잉볼 같은 울림
                sample += sin(twoPi * f * t)
                sample += 0.30 * sin(twoPi * f * 2.0 * t) * exp(-t / (decay * 0.5))
                sample += 0.12 * sin(twoPi * f * 3.01 * t) * exp(-t / (decay * 0.3))
            }
            sample /= Double(freqs.count) * 1.42
            data[i] = Float(sample * envelope * amplitude)
        }
        return buffer
    }
}

/// 실시간 오디오 스레드에서 호출되는 노이즈 생성기.
/// 빗소리(핑크 노이즈), 파도(일렁이는 브라운 노이즈), 깊은 소음(브라운), 백색 소음을 만든다.
final class NoiseGenerator {
    // 오디오 스레드에서 읽는 값. 정수/실수 하나씩이라 잠금 없이 써도 실사용에 문제가 없다.
    private var kindRaw: Int = 0
    var targetGain: Float = 0

    private var gain: Float = 0
    private var seed: UInt32 = 0x1234_5678
    private var b0: Float = 0, b1: Float = 0, b2: Float = 0, b3: Float = 0, b4: Float = 0, b5: Float = 0, b6: Float = 0
    private var brown: Float = 0
    private var lfoPhase: Double = 0
    private let lfoStep: Double

    init(sampleRate: Double) {
        lfoStep = 1 / (sampleRate * 9) // 파도 한 번에 약 9초
    }

    func setKind(_ kind: AmbientSound) {
        switch kind {
        case .none: break // 음량만 0으로 줄여 자연스럽게 사라지게 둔다
        case .rain: kindRaw = 1
        case .ocean: kindRaw = 2
        case .deep: kindRaw = 3
        case .white: kindRaw = 4
        }
    }

    @inline(__always)
    private func white() -> Float {
        seed ^= seed << 13
        seed ^= seed >> 17
        seed ^= seed << 5
        return Float(seed) / Float(UInt32.max) * 2 - 1
    }

    func nextSample() -> Float {
        gain += (targetGain - gain) * 0.00006
        if gain < 0.0005 && targetGain == 0 {
            gain = 0
            return 0
        }

        let w = white()
        // Paul Kellet 핑크 노이즈 필터
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        let pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
        // 브라운 노이즈 (적분 + 누설)
        brown = (brown + 0.02 * w) / 1.02
        let deep = brown * 3.5

        var out: Float
        switch kindRaw {
        case 1:
            out = pink * 0.9
        case 2:
            lfoPhase += lfoStep
            if lfoPhase >= 1 { lfoPhase -= 1 }
            let s = sin(Double.pi * lfoPhase)
            let swell = Float(0.2 + 0.8 * s * s)
            out = (deep * 0.75 + pink * 0.35) * swell
        case 3:
            out = deep
        case 4:
            out = w * 0.22
        default:
            out = 0
        }
        return out * gain
    }
}
