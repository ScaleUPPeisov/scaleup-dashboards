import Foundation
import AVFoundation
import AppKit
import QuartzCore

struct Caption: Codable {
    let start: Double
    let end: Double
    let text: String
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

func render(
    _ input: String,
    _ output: String,
    _ captionsPath: String,
    _ mode: String,
    _ captionStyle: String,
    _ highlightKeywords: Bool
) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    guard let sourceVideo = asset.tracks(withMediaType: .video).first else {
        throw RFError.message("В файле нет видеодорожки")
    }

    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
        throw RFError.message("Не удалось создать видеодорожку")
    }

    try videoTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: asset.duration),
        of: sourceVideo,
        at: .zero
    )

    if let sourceAudio = asset.tracks(withMediaType: .audio).first,
       let audioTrack = composition.addMutableTrack(
        withMediaType: .audio,
        preferredTrackID: kCMPersistentTrackID_Invalid
       ) {
        try audioTrack.insertTimeRange(
            CMTimeRange(start: .zero, duration: asset.duration),
            of: sourceAudio,
            at: .zero
        )
    }

    let (baseTransform, orientedSize) = normalizedTransform(sourceVideo)
    let renderSize: CGSize = mode == "original" ? orientedSize : CGSize(width: 1080, height: 1920)
    let sx = renderSize.width / orientedSize.width
    let sy = renderSize.height / orientedSize.height

    let scale: CGFloat
    if mode == "crop916" {
        scale = max(sx, sy)
    } else if mode == "fit916" {
        scale = min(sx, sy)
    } else {
        scale = 1.0
    }

    let scaledSize = CGSize(width: orientedSize.width * scale, height: orientedSize.height * scale)
    let tx = (renderSize.width - scaledSize.width) / 2.0
    let ty = (renderSize.height - scaledSize.height) / 2.0

    var transform = baseTransform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    transform = transform.concatenating(
        CGAffineTransform(
            translationX: tx / max(scale, 0.0001),
            y: ty / max(scale, 0.0001)
        )
    )

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)

    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    layerInstruction.setTransform(transform, at: .zero)
    instruction.layerInstructions = [layerInstruction]

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    let sourceFPS = sourceVideo.nominalFrameRate > 0 ? min(sourceVideo.nominalFrameRate, 60.0) : 30.0
    videoComposition.frameDuration = CMTime(
        value: 1,
        timescale: CMTimeScale(max(24.0, sourceFPS).rounded())
    )
    videoComposition.instructions = [instruction]

    let parentLayer = CALayer()
    parentLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.backgroundColor = NSColor.black.cgColor

    let videoLayer = CALayer()
    videoLayer.frame = parentLayer.bounds
    parentLayer.addSublayer(videoLayer)

    let captionData = try Data(contentsOf: URL(fileURLWithPath: captionsPath))
    let captions = (try? JSONDecoder().decode([Caption].self, from: captionData)) ?? []

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
        textLayer.string = attributedCaption(
            caption.text,
            style: captionStyle,
            highlight: highlightKeywords,
            fontSize: fontSize
        )

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
        textLayer.frame = CGRect(
            x: (renderSize.width - width) / 2.0,
            y: y,
            width: width,
            height: height
        )
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

    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
        postProcessingAsVideoLayer: videoLayer,
        in: parentLayer
    )

    guard let session = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetHighestQuality
    ) else {
        throw RFError.message("Не удалось создать видео-экспорт")
    }

    let outputURL = URL(fileURLWithPath: output)
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    session.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    session.shouldOptimizeForNetworkUse = true
    try waitExport(session)
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 3 else {
        throw RFError.message("Usage: probe input | extract-audio input output | render input output captions.json mode style highlight")
    }

    switch arguments[1] {
    case "probe":
        try probe(arguments[2])
    case "extract-audio":
        guard arguments.count >= 4 else { throw RFError.message("extract-audio args missing") }
        try extractAudio(arguments[2], arguments[3])
    case "render":
        guard arguments.count >= 8 else { throw RFError.message("render args missing") }
        try render(
            arguments[2],
            arguments[3],
            arguments[4],
            arguments[5],
            arguments[6],
            arguments[7] == "1"
        )
    default:
        throw RFError.message("Unknown command")
    }
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
