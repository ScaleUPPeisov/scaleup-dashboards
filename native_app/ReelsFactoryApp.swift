import Cocoa
import WebKit
import AVFoundation
import QuartzCore

let appVersion = "0.2.0"
let updateChannelURL = "https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/reelsfactory-desktop/update-channel.json"

struct Caption: Codable {
    let start: Double
    let end: Double
    let text: String
}

struct UpdateChannel: Codable {
    let version: String
    let notes: String
    let source_url: String
    let sha256: String?
}

enum RFError: Error, CustomStringConvertible {
    case message(String)
    var description: String {
        switch self { case .message(let s): return s }
    }
}

func runProcess(_ executable: String, _ arguments: [String], label: String) throws {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: executable)
    p.arguments = arguments
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    try p.run()
    p.waitUntilExit()
    if p.terminationStatus != 0 {
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let msg = String(data: data, encoding: .utf8) ?? ""
        throw RFError.message("\(label): \(msg.trimmingCharacters(in: .whitespacesAndNewlines))")
    }
}

func waitExport(_ session: AVAssetExportSession) throws {
    let sem = DispatchSemaphore(value: 0)
    session.exportAsynchronously { sem.signal() }
    sem.wait()
    if session.status != .completed {
        throw RFError.message(session.error?.localizedDescription ?? "Ошибка AVFoundation: \(session.status.rawValue)")
    }
}

func extractAudio(_ input: URL, _ output: URL) throws {
    let asset = AVURLAsset(url: input)
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        throw RFError.message("Не удалось создать аудиодорожку")
    }
    try? FileManager.default.removeItem(at: output)
    session.outputURL = output
    session.outputFileType = .m4a
    session.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    try waitExport(session)
}

func srtTime(_ raw: String) -> Double? {
    let parts = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".").split(separator: ":")
    guard parts.count == 3,
          let h = Double(parts[0]),
          let m = Double(parts[1]),
          let s = Double(parts[2]) else { return nil }
    return h * 3600 + m * 60 + s
}

func parseSRT(_ url: URL) throws -> [Caption] {
    let raw = try String(contentsOf: url, encoding: .utf8).replacingOccurrences(of: "\r\n", with: "\n")
    var result: [Caption] = []
    for block in raw.components(separatedBy: "\n\n") {
        let lines = block.components(separatedBy: "\n").filter { !$0.isEmpty }
        guard lines.count >= 3 else { continue }
        let times = lines[1].components(separatedBy: " --> ")
        guard times.count == 2, let start = srtTime(times[0]), let end = srtTime(times[1]) else { continue }
        let text = lines.dropFirst(2).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { result.append(Caption(start: start, end: end, text: text)) }
    }
    return result
}

func modelURL() throws -> URL {
    let appSupport = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let dir = appSupport.appendingPathComponent("ReelsFactory/models", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("ggml-base.bin")
}

func ensureModel() throws -> URL {
    let target = try modelURL()
    if let attrs = try? FileManager.default.attributesOfItem(atPath: target.path),
       let size = attrs[.size] as? NSNumber, size.int64Value > 100_000_000 { return target }
    let temp = target.appendingPathExtension("download")
    try? FileManager.default.removeItem(at: temp)
    try runProcess("/usr/bin/curl", ["-L", "--fail", "--retry", "3", "-o", temp.path, "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"], label: "Загрузка модели субтитров")
    try? FileManager.default.removeItem(at: target)
    try FileManager.default.moveItem(at: temp, to: target)
    return target
}

func bundledWhisper() throws -> URL {
    guard let url = Bundle.main.url(forResource: "whisper-cli", withExtension: nil) else {
        throw RFError.message("В приложении отсутствует whisper-cli")
    }
    return url
}

func orientedInfo(_ track: AVAssetTrack) -> (CGAffineTransform, CGSize) {
    let natural = track.naturalSize
    let transformed = CGRect(origin: .zero, size: natural).applying(track.preferredTransform)
    let width = abs(transformed.width)
    let height = abs(transformed.height)
    var base = track.preferredTransform
    base.tx -= transformed.minX
    base.ty -= transformed.minY
    return (base, CGSize(width: width, height: height))
}

func even(_ value: CGFloat) -> CGFloat {
    let v = max(2, Int(value.rounded()))
    return CGFloat(v % 2 == 0 ? v : v - 1)
}

func renderVideo(input: URL, output: URL, captions: [Caption], mode: String) throws {
    let asset = AVURLAsset(url: input)
    guard let sourceVideo = asset.tracks(withMediaType: .video).first else {
        throw RFError.message("В выбранном файле нет видеодорожки")
    }
    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw RFError.message("Не удалось создать видеодорожку")
    }
    try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: sourceVideo, at: .zero)
    if let sourceAudio = asset.tracks(withMediaType: .audio).first,
       let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
        try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: sourceAudio, at: .zero)
    }

    let (base, oriented) = orientedInfo(sourceVideo)
    let target: CGSize
    if mode == "original" {
        target = CGSize(width: even(oriented.width), height: even(oriented.height))
    } else {
        target = CGSize(width: 1080, height: 1920)
    }
    let sx = target.width / oriented.width
    let sy = target.height / oriented.height
    let scale: CGFloat = mode == "crop916" ? max(sx, sy) : (mode == "fit916" ? min(sx, sy) : 1)
    let scaled = CGSize(width: oriented.width * scale, height: oriented.height * scale)
    let dx = (target.width - scaled.width) / 2
    let dy = (target.height - scaled.height) / 2
    let transform = CGAffineTransform(
        a: base.a * scale, b: base.b * scale,
        c: base.c * scale, d: base.d * scale,
        tx: base.tx * scale + dx, ty: base.ty * scale + dy
    )

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    layerInstruction.setTransform(transform, at: .zero)
    instruction.layerInstructions = [layerInstruction]

    let vc = AVMutableVideoComposition()
    vc.renderSize = target
    let nominal = sourceVideo.nominalFrameRate > 0 ? sourceVideo.nominalFrameRate : 30
    let fps = max(24, min(60, nominal))
    vc.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
    vc.instructions = [instruction]

    let parent = CALayer()
    parent.frame = CGRect(origin: .zero, size: target)
    parent.backgroundColor = NSColor.black.cgColor
    let videoLayer = CALayer()
    videoLayer.frame = parent.bounds
    parent.addSublayer(videoLayer)

    for c in captions {
        let textLayer = CATextLayer()
        textLayer.contentsScale = 2
        textLayer.alignmentMode = .center
        textLayer.isWrapped = true
        textLayer.backgroundColor = NSColor(calibratedWhite: 0, alpha: 0.58).cgColor
        textLayer.cornerRadius = 12
        let fontSize = max(28, target.width * 0.052)
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let attributed = NSAttributedString(string: c.text.uppercased(), attributes: [
            .font: NSFont.systemFont(ofSize: fontSize, weight: .heavy),
            .foregroundColor: NSColor.white,
            .paragraphStyle: paragraph
        ])
        textLayer.string = attributed
        let w = target.width * 0.88
        let h = max(110, target.height * 0.12)
        textLayer.frame = CGRect(x: (target.width - w) / 2, y: target.height * 0.10, width: w, height: h)
        textLayer.opacity = 0
        let anim = CAKeyframeAnimation(keyPath: "opacity")
        anim.values = [0, 1, 1, 0]
        anim.keyTimes = [0, 0.02, 0.96, 1]
        anim.beginTime = AVCoreAnimationBeginTimeAtZero + c.start
        anim.duration = max(0.12, c.end - c.start)
        anim.isRemovedOnCompletion = false
        anim.fillMode = .both
        textLayer.add(anim, forKey: "caption")
        parent.addSublayer(textLayer)
    }
    vc.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        throw RFError.message("Не удалось создать экспорт")
    }
    try? FileManager.default.removeItem(at: output)
    session.outputURL = output
    session.outputFileType = .mp4
    session.videoComposition = vc
    session.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    session.shouldOptimizeForNetworkUse = true
    try waitExport(session)
}

func processVideo(inputPath: String, aspect: String, captionsEnabled: Bool) throws -> String {
    let input = URL(fileURLWithPath: inputPath)
    guard FileManager.default.fileExists(atPath: input.path) else { throw RFError.message("Исходный файл не найден") }
    let desktop = try FileManager.default.url(for: .desktopDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let stamp = Int(Date().timeIntervalSince1970)
    let output = desktop.appendingPathComponent("ReelsFactory-\(stamp).mp4")
    var captions: [Caption] = []

    if captionsEnabled {
        let work = FileManager.default.temporaryDirectory.appendingPathComponent("ReelsFactory-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: work) }
        let m4a = work.appendingPathComponent("audio.m4a")
        let wav = work.appendingPathComponent("audio.wav")
        try extractAudio(input, m4a)
        try runProcess("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", m4a.path, wav.path], label: "Подготовка аудио")
        let model = try ensureModel()
        let prefix = work.appendingPathComponent("transcript")
        let whisper = try bundledWhisper()
        try runProcess(whisper.path, ["-m", model.path, "-f", wav.path, "-l", "auto", "-osrt", "-of", prefix.path], label: "Распознавание речи")
        captions = try parseSRT(URL(fileURLWithPath: prefix.path + ".srt"))
        if captions.isEmpty { throw RFError.message("Речь не распознана: Whisper не создал субтитры") }
    }

    try renderVideo(input: input, output: output, captions: captions, mode: aspect)
    return output.path
}

func versionParts(_ v: String) -> [Int] {
    return v.trimmingCharacters(in: CharacterSet(charactersIn: "v")).split(separator: ".").prefix(3).map { Int($0) ?? 0 }
}

func isNewer(_ candidate: String, than current: String) -> Bool {
    let a = versionParts(candidate) + [0,0,0]
    let b = versionParts(current) + [0,0,0]
    for i in 0..<3 {
        if a[i] != b[i] { return a[i] > b[i] }
    }
    return false
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "reels")
        webView = WKWebView(frame: .zero, configuration: config)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1380, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "ReelsFactory"
        window.minSize = NSSize(width: 980, height: 700)
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let html = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
        } else {
            webView.loadHTMLString("<h1 style='color:white;background:#111'>ReelsFactory: UI resource missing</h1>", baseURL: nil)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func reply(_ id: Int, ok: Bool, value: Any) {
        let object: Any = value
        let data = try? JSONSerialization.data(withJSONObject: object, options: [])
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "null"
        let js = "window.rfNativeResult(\(id), \(ok ? "true" : "false"), \(json));"
        DispatchQueue.main.async { self.webView.evaluateJavaScript(js, completionHandler: nil) }
    }

    func fail(_ id: Int, _ error: Error) { reply(id, ok: false, value: ["error": String(describing: error)]) }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let id = body["id"] as? Int,
              let action = body["action"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch action {
        case "pickVideo":
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = false
            panel.allowedFileTypes = ["mp4", "mov", "m4v"]
            panel.begin { response in
                if response == .OK, let url = panel.url { self.reply(id, ok: true, value: ["path": url.path]) }
                else { self.reply(id, ok: true, value: ["path": NSNull()]) }
            }
        case "processVideo":
            guard let input = payload["input"] as? String else { self.reply(id, ok: false, value: ["error": "Не выбран файл"]); return }
            let aspect = payload["aspect"] as? String ?? "original"
            let captions = payload["captions"] as? Bool ?? true
            DispatchQueue.global(qos: .userInitiated).async {
                do { let output = try processVideo(inputPath: input, aspect: aspect, captionsEnabled: captions); self.reply(id, ok: true, value: ["output": output]) }
                catch { self.fail(id, error) }
            }
        case "revealFile":
            if let path = payload["path"] as? String { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
            reply(id, ok: true, value: [:])
        case "checkUpdate":
            guard let url = URL(string: updateChannelURL) else { reply(id, ok: false, value: ["error": "Некорректный update channel"]); return }
            URLSession.shared.dataTask(with: url) { data, _, error in
                if let error = error { self.fail(id, error); return }
                guard let data = data else { self.reply(id, ok: false, value: ["error": "Пустой ответ update channel"]); return }
                do {
                    let channel = try JSONDecoder().decode(UpdateChannel.self, from: data)
                    self.reply(id, ok: true, value: ["available": isNewer(channel.version, than: appVersion), "version": channel.version, "notes": channel.notes, "source_url": channel.source_url])
                } catch { self.fail(id, error) }
            }.resume()
        case "installUpdate":
            guard let sourceURL = payload["source_url"] as? String,
                  let script = Bundle.main.url(forResource: "self_update", withExtension: "zsh") else {
                reply(id, ok: false, value: ["error": "Не найден модуль обновления"]); return
            }
            do {
                let logDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/ReelsFactory", isDirectory: true)
                try FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
                let log = logDir.appendingPathComponent("update.log")
                FileManager.default.createFile(atPath: log.path, contents: nil)
                let handle = try FileHandle(forWritingTo: log)
                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/bin/zsh")
                p.arguments = [script.path, Bundle.main.bundleURL.path, sourceURL]
                p.standardOutput = handle
                p.standardError = handle
                try p.run()
                reply(id, ok: true, value: [:])
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { NSApp.terminate(nil) }
            } catch { fail(id, error) }
        default:
            reply(id, ok: false, value: ["error": "Неизвестная команда \(action)"])
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
