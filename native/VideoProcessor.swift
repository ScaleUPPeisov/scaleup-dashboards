import Foundation
import AVFoundation
import AppKit
import QuartzCore
import Vision

struct Caption: Codable {
    let start: Double
    let end: Double
    let text: String
}

struct EditSegment: Codable {
    let start: Double
    let end: Double
}

struct FaceSample {
    let outputTime: Double
    let centerX: CGFloat?
}

enum RFError: Error, CustomStringConvertible {
    case message(String)

    var description: String {
        if case let .message(value) = self { return value }
        return "ReelsFactory error"
    }
}

func waitExport(_ session: AVAssetExportSession) throws {
    let semaphore = DispatchSemaphore(value: 0)
    session.exportAsynchronously { semaphore.signal() }
    semaphore.wait()
    if session.status != .completed {
        throw RFError.message(session.error?.localizedDescription ?? "Export failed: \(session.status.rawValue)")
    }
}

func probe(_ input: String) throws {
    let url = URL(fileURLWithPath: input)
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else {
        throw RFError.message("В файле нет видеодорожки")
    }

    let transformed = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
    let attributes = try FileManager.default.attributesOfItem(atPath: input)
    let fileSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    let durationSeconds = CMTimeGetSeconds(asset.duration)

    let payload: [String: Any] = [
        "duration": durationSeconds.isFinite ? durationSeconds : 0,
        "width": Int(abs(transformed.width)),
        "height": Int(abs(transformed.height)),
        "fps": track.nominalFrameRate > 0 ? Double(track.nominalFrameRate) : 30.0,
        "size": fileSize
    ]

    let data = try JSONSerialization.data(withJSONObject: payload)
    FileHandle.standardOutput.write(data)
}

func extractAudio(_ input: String, _ output: String) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        throw RFError.message("Не удалось создать аудио-экспорт")
    }

    let outputURL = URL(fileURLWithPath: output)
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL
    session.outputFileType = .m4a
    session.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    try waitExport(session)
}

func normalizedTransform(_ track: AVAssetTrack) -> (CGAffineTransform, CGSize) {
    let natural = track.naturalSize
    let transformed = CGRect(origin: .zero, size: natural).applying(track.preferredTransform)
    let size = CGSize(width: abs(transformed.width), height: abs(transformed.height))
    let correction = CGAffineTransform(translationX: -transformed.minX, y: -transformed.minY)
    return (track.preferredTransform.concatenating(correction), size)
}

func attributedCaption(_ raw: String, style: String, highlight: Bool, fontSize: CGFloat) -> NSAttributedString {
    let renderedText = style == "minimal" ? raw : raw.uppercased()
    let weight: NSFont.Weight = style == "bold" ? .heavy : (style == "minimal" ? .semibold : .bold)
    let font = NSFont.systemFont(ofSize: fontSize, weight: weight)
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center

    let baseAttributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor.white,
        .paragraphStyle: paragraph
    ]
    let result = NSMutableAttributedString(string: renderedText, attributes: baseAttributes)
    guard highlight else { return result }

    let stopWords = Set([
        "КОТОРЫЙ", "КОТОРАЯ", "ПОТОМУ", "ПОЭТОМУ", "ЧТОБЫ",
        "WHICH", "BECAUSE", "THEREFORE", "ABOUT", "THESE", "THOSE"
    ])
    let nsText = renderedText as NSString
    var searchLocation = 0

    for token in renderedText.split(separator: " ") {
        let tokenString = String(token)
        let clean = tokenString.trimmingCharacters(in: .punctuationCharacters)
        defer { searchLocation = min(nsText.length, searchLocation + tokenString.utf16.count + 1) }

        if clean.count < 6 || stopWords.contains(clean.uppercased()) { continue }
        let searchRange = NSRange(location: searchLocation, length: max(0, nsText.length - searchLocation))
        let tokenRange = nsText.range(of: tokenString, options: [], range: searchRange)
        if tokenRange.location != NSNotFound {
            result.addAttribute(.foregroundColor, value: NSColor.systemYellow, range: tokenRange)
        }
    }
    return result
}

func emphasisScore(_ text: String) -> Int {
    let upper = text.uppercased()
    var score = 0
    if upper.contains("?") || upper.contains("!") { score += 2 }
    if upper.rangeOfCharacter(from: .decimalDigits) != nil { score += 2 }

    let keywords = [
        "ВАЖНО", "ГЛАВНОЕ", "ОШИБКА", "ПРИБЫЛ", "ДЕНЬГ", "ПРОДАЖ", "РЕЗУЛЬТАТ", "СЕКРЕТ", "ПОЧЕМУ", "КАК ", "НИКОГДА", "ВСЕГДА", "РЕКЛАМ",
        "IMPORTANT", "MISTAKE", "PROFIT", "MONEY", "SALES", "RESULT", "SECRET", "WHY", "HOW ", "NEVER", "ALWAYS", "REVENUE"
    ]
    if keywords.contains(where: { upper.contains($0) }) { score += 2 }

    let wordCount = upper.split(separator: " ").count
    if wordCount >= 3 && wordCount <= 10 { score += 1 }
    return score
}

func zoomFactor(at time: Double, captions: [Caption], mode: String) -> CGFloat {
    guard mode != "off" else { return 1.0 }
    let amount: CGFloat = mode == "dynamic" ? 1.085 : 1.045
    for caption in captions {
        guard emphasisScore(caption.text) >= 2 else { continue }
        let accentEnd = min(caption.end, caption.start + 0.75)
        if time >= caption.start && time <= accentEnd { return amount }
    }
    return 1.0
}

func detectFaceCenter(generator: AVAssetImageGenerator, at seconds: Double) -> CGFloat? {
    let time = CMTime(seconds: seconds, preferredTimescale: 600)
    guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { return nil }
    let request = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
        guard let faces = request.results, !faces.isEmpty else { return nil }
        let best = faces.max { lhs, rhs in
            lhs.boundingBox.width * lhs.boundingBox.height < rhs.boundingBox.width * rhs.boundingBox.height
        }
        return best.map { CGFloat($0.boundingBox.midX) }
    } catch {
        return nil
    }
}

func buildFaceSamples(asset: AVAsset, segments: [EditSegment], enabled: Bool) -> [FaceSample] {
    guard enabled else { return [] }
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.12, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.12, preferredTimescale: 600)
    generator.maximumSize = CGSize(width: 720, height: 720)

    var result: [FaceSample] = []
    var outputCursor = 0.0
    var smoothed: CGFloat?

    for segment in segments {
        let duration = max(0.0, segment.end - segment.start)
        var local = 0.0
        while local <= duration + 0.001 {
            let sourceTime = min(segment.end, segment.start + local)
            let detected = detectFaceCenter(generator: generator, at: sourceTime)
            if let detected {
                if let old = smoothed {
                    smoothed = old * 0.72 + detected * 0.28
                } else {
                    smoothed = detected
                }
            }
            result.append(FaceSample(outputTime: outputCursor + local, centerX: smoothed))
            local += 0.55
        }
        outputCursor += duration
    }
    return result
}

func framingTransform(
    baseTransform: CGAffineTransform,
    orientedSize: CGSize,
    renderSize: CGSize,
    mode: String,
    faceCenterX: CGFloat?,
    zoom: CGFloat
) -> CGAffineTransform {
    let sx = renderSize.width / orientedSize.width
    let sy = renderSize.height / orientedSize.height
    let baseScale: CGFloat
    switch mode {
    case "crop916", "face916": baseScale = max(sx, sy)
    case "fit916": baseScale = min(sx, sy)
    default: baseScale = 1.0
    }

    let finalScale = baseScale * zoom
    let scaledWidth = orientedSize.width * finalScale
    let scaledHeight = orientedSize.height * finalScale

    var tx = (renderSize.width - scaledWidth) / 2.0
    if mode == "face916", let faceCenterX {
        let desired = renderSize.width * 0.50 - (orientedSize.width * faceCenterX * finalScale)
        let minTx = min(0, renderSize.width - scaledWidth)
        let maxTx = max(0, renderSize.width - scaledWidth)
        tx = min(max(desired, minTx), maxTx)
    }
    let ty = (renderSize.height - scaledHeight) / 2.0

    var transform = baseTransform.concatenating(CGAffineTransform(scaleX: finalScale, y: finalScale))
    transform = transform.concatenating(
        CGAffineTransform(
            translationX: tx / max(finalScale, 0.0001),
            y: ty / max(finalScale, 0.0001)
        )
    )
    return transform
}

func render(
    _ input: String,
    _ output: String,
    _ captionsPath: String,
    _ segmentsPath: String,
    _ mode: String,
    _ captionStyle: String,
    _ highlightKeywords: Bool,
    _ zoomMode: String
) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    guard let sourceVideo = asset.tracks(withMediaType: .video).first else {
        throw RFError.message("В файле нет видеодорожки")
    }

    let captionData = try Data(contentsOf: URL(fileURLWithPath: captionsPath))
    let captions = (try? JSONDecoder().decode([Caption].self, from: captionData)) ?? []
    let segmentData = try Data(contentsOf: URL(fileURLWithPath: segmentsPath))
    var segments = (try? JSONDecoder().decode([EditSegment].self, from: segmentData)) ?? []
    if segments.isEmpty {
        segments = [EditSegment(start: 0, end: CMTimeGetSeconds(asset.duration))]
    }

    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw RFError.message("Не удалось создать видеодорожку")
    }
    let sourceAudio = asset.tracks(withMediaType: .audio).first
    let audioTrack = sourceAudio == nil ? nil : composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)

    var cursor = CMTime.zero
    for segment in segments {
        let start = CMTime(seconds: max(0, segment.start), preferredTimescale: 600)
        let duration = CMTime(seconds: max(0.01, segment.end - segment.start), preferredTimescale: 600)
        let range = CMTimeRange(start: start, duration: duration)
        try videoTrack.insertTimeRange(range, of: sourceVideo, at: cursor)
        if let sourceAudio, let audioTrack {
            try audioTrack.insertTimeRange(range, of: sourceAudio, at: cursor)
        }
        cursor = CMTimeAdd(cursor, duration)
    }

    let (baseTransform, orientedSize) = normalizedTransform(sourceVideo)
    let renderSize: CGSize = mode == "original" ? orientedSize : CGSize(width: 1080, height: 1920)
    let outputDuration = CMTimeGetSeconds(composition.duration)

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)

    let faceSamples = buildFaceSamples(asset: asset, segments: segments, enabled: mode == "face916")
    var timeline = Set<Double>()
    timeline.insert(0)
    timeline.insert(max(0, outputDuration))
    var tick = 0.0
    while tick < outputDuration {
        timeline.insert(tick)
        tick += 0.40
    }
    for sample in faceSamples { timeline.insert(sample.outputTime) }
    for caption in captions {
        timeline.insert(caption.start)
        timeline.insert(min(caption.end, caption.start + 0.75))
        timeline.insert(caption.end)
    }
    let times = timeline.filter { $0 >= 0 && $0 <= outputDuration }.sorted()

    func faceAt(_ time: Double) -> CGFloat? {
        guard !faceSamples.isEmpty else { return nil }
        var nearest = faceSamples[0]
        var bestDistance = abs(nearest.outputTime - time)
        for sample in faceSamples.dropFirst() {
            let distance = abs(sample.outputTime - time)
            if distance < bestDistance {
                nearest = sample
                bestDistance = distance
            }
        }
        return nearest.centerX
    }

    if times.count <= 1 {
        let transform = framingTransform(
            baseTransform: baseTransform,
            orientedSize: orientedSize,
            renderSize: renderSize,
            mode: mode,
            faceCenterX: faceAt(0),
            zoom: zoomFactor(at: 0, captions: captions, mode: zoomMode)
        )
        layerInstruction.setTransform(transform, at: .zero)
    } else {
        for index in 0..<(times.count - 1) {
            let startSeconds = times[index]
            let endSeconds = times[index + 1]
            if endSeconds - startSeconds < 0.01 { continue }
            let startTransform = framingTransform(
                baseTransform: baseTransform,
                orientedSize: orientedSize,
                renderSize: renderSize,
                mode: mode,
                faceCenterX: faceAt(startSeconds),
                zoom: zoomFactor(at: startSeconds, captions: captions, mode: zoomMode)
            )
            let endTransform = framingTransform(
                baseTransform: baseTransform,
                orientedSize: orientedSize,
                renderSize: renderSize,
                mode: mode,
                faceCenterX: faceAt(endSeconds),
                zoom: zoomFactor(at: endSeconds, captions: captions, mode: zoomMode)
            )
            layerInstruction.setTransformRamp(
                fromStart: startTransform,
                toEnd: endTransform,
                timeRange: CMTimeRange(
                    start: CMTime(seconds: startSeconds, preferredTimescale: 600),
                    duration: CMTime(seconds: endSeconds - startSeconds, preferredTimescale: 600)
                )
            )
        }
    }

    instruction.layerInstructions = [layerInstruction]
    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    let sourceFPS = sourceVideo.nominalFrameRate > 0 ? min(sourceVideo.nominalFrameRate, 60.0) : 30.0
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(24.0, sourceFPS).rounded()))
    videoComposition.instructions = [instruction]

    let parentLayer = CALayer()
    parentLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.backgroundColor = NSColor.black.cgColor
    let videoLayer = CALayer()
    videoLayer.frame = parentLayer.bounds
    parentLayer.addSublayer(videoLayer)

    for caption in captions {
        let textLayer = CATextLayer()
        textLayer.contentsScale = 2.0
        textLayer.alignmentMode = .center
        textLayer.isWrapped = true

        let relativeFontSize: CGFloat
        switch captionStyle {
        case "bold": relativeFontSize = 0.061
        case "minimal": relativeFontSize = 0.044
        default: relativeFontSize = 0.052
        }
        let fontSize = max(28.0, renderSize.width * relativeFontSize)
        textLayer.string = attributedCaption(caption.text, style: captionStyle, highlight: highlightKeywords, fontSize: fontSize)
        textLayer.cornerRadius = captionStyle == "minimal" ? 0 : 12
        if captionStyle == "minimal" {
            textLayer.backgroundColor = NSColor.clear.cgColor
        } else {
            let alpha: CGFloat = captionStyle == "podcast" ? 0.78 : 0.58
            textLayer.backgroundColor = NSColor(calibratedWhite: 0, alpha: alpha).cgColor
        }

        let width = renderSize.width * (captionStyle == "bold" ? 0.92 : 0.86)
        let height = max(100.0, renderSize.height * (captionStyle == "bold" ? 0.13 : 0.105))
        let y = captionStyle == "podcast" ? renderSize.height * 0.15 : renderSize.height * 0.10
        textLayer.frame = CGRect(x: (renderSize.width - width) / 2.0, y: y, width: width, height: height)
        textLayer.opacity = 0

        let opacity = CAKeyframeAnimation(keyPath: "opacity")
        opacity.values = [0, 1, 1, 0]
        opacity.keyTimes = [0, 0.03, 0.95, 1]
        opacity.beginTime = AVCoreAnimationBeginTimeAtZero + caption.start
        opacity.duration = max(0.12, caption.end - caption.start)
        opacity.isRemovedOnCompletion = false
        opacity.fillMode = .both
        textLayer.add(opacity, forKey: "captionOpacity")

        if captionStyle == "dynamic" || captionStyle == "bold" {
            let pop = CAKeyframeAnimation(keyPath: "transform.scale")
            pop.values = captionStyle == "bold" ? [0.90, 1.06, 1.0] : [0.96, 1.02, 1.0]
            pop.keyTimes = [0, 0.20, 1]
            pop.beginTime = AVCoreAnimationBeginTimeAtZero + caption.start
            pop.duration = min(0.28, max(0.16, caption.end - caption.start))
            pop.isRemovedOnCompletion = false
            pop.fillMode = .both
            textLayer.add(pop, forKey: "captionPop")
        }
        parentLayer.addSublayer(textLayer)
    }

    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parentLayer)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        throw RFError.message("Не удалось создать видео-экспорт")
    }
    let outputURL = URL(fileURLWithPath: output)
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    session.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
    session.shouldOptimizeForNetworkUse = true
    try waitExport(session)
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 3 else {
        throw RFError.message("Usage: probe input | extract-audio input output | render input output captions.json segments.json mode style highlight zoom")
    }

    switch arguments[1] {
    case "probe":
        try probe(arguments[2])
    case "extract-audio":
        guard arguments.count >= 4 else { throw RFError.message("extract-audio args missing") }
        try extractAudio(arguments[2], arguments[3])
    case "render":
        guard arguments.count >= 10 else { throw RFError.message("render args missing") }
        try render(
            arguments[2], arguments[3], arguments[4], arguments[5], arguments[6], arguments[7], arguments[8] == "1", arguments[9]
        )
    default:
        throw RFError.message("Unknown command")
    }
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
