import Foundation
import AVFoundation
import AppKit
import QuartzCore

struct Caption: Codable { let start: Double; let end: Double; let text: String }

enum RFError: Error, CustomStringConvertible {
    case message(String)
    var description: String {
        if case let .message(s) = self { return s }
        return "ReelsFactory error"
    }
}

func waitExport(_ session: AVAssetExportSession) throws {
    let sem = DispatchSemaphore(value: 0)
    session.exportAsynchronously { sem.signal() }
    sem.wait()
    if session.status != .completed {
        throw RFError.message(session.error?.localizedDescription ?? "Export failed: \(session.status.rawValue)")
    }
}

func probe(_ input: String) throws {
    let url = URL(fileURLWithPath: input)
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else { throw RFError.message("В файле нет видеодорожки") }
    let transformed = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
    let size = try FileManager.default.attributesOfItem(atPath: input)[.size] as? NSNumber
    let payload: [String: Any] = [
        "duration": CMTimeGetSeconds(asset.duration).isFinite ? CMTimeGetSeconds(asset.duration) : 0,
        "width": Int(abs(transformed.width)),
        "height": Int(abs(transformed.height)),
        "fps": track.nominalFrameRate > 0 ? Double(track.nominalFrameRate) : 30.0,
        "size": size?.int64Value ?? 0
    ]
    let data = try JSONSerialization.data(withJSONObject: payload)
    FileHandle.standardOutput.write(data)
}

func extractAudio(_ input: String, _ output: String) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        throw RFError.message("Не удалось создать аудио-экспорт")
    }
    let out = URL(fileURLWithPath: output)
    try? FileManager.default.removeItem(at: out)
    session.outputURL = out
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
    let text = style == "minimal" ? raw : raw.uppercased()
    let font: NSFont = style == "minimal" ? .systemFont(ofSize: fontSize, weight: .semibold) : .systemFont(ofSize: fontSize, weight: style == "bold" ? .heavy : .bold)
    let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
    let base: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: paragraph]
    let result = NSMutableAttributedString(string: text, attributes: base)
    guard highlight else { return result }
    let words = text.split(separator: " ")
    var cursor = 0
    let stop = Set(["КОТОРЫЙ","КОТОРАЯ","ПОТОМУ","ПОЭТОМУ","ЧТОБЫ","WHICH","BECAUSE","THEREFORE","ABOUT","THESE","THOSE"])
    for wordSub in words {
        let word = String(wordSub).trimmingCharacters(in: .punctuationCharacters)
        defer { cursor += wordSub.count + 1 }
        if word.count < 6 || stop.contains(word.uppercased()) { continue }
        let ns = text as NSString
        let search = NSRange(location: max(0, min(cursor, ns.length)), length: max(0, ns.length - min(cursor, ns.length)))
        let range = ns.range(of: String(wordSub), options: [], range: search)
        if range.location != NSNotFound { result.addAttribute(.foregroundColor, value: NSColor.systemYellow, range: range) }
    }
    return result
}

func render(_ input: String, _ output: String, _ captionsPath: String, _ mode: String, _ captionStyle: String, _ highlightKeywords: Bool) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    guard let sourceVideo = asset.tracks(withMediaType: .video).first else { throw RFError.message("В файле нет видеодорожки") }

    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw RFError.message("Не удалось создать видеодорожку") }
    try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: sourceVideo, at: .zero)
    if let sourceAudio = asset.tracks(withMediaType: .audio).first, let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
        try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: sourceAudio, at: .zero)
    }

    let (base, oriented) = normalizedTransform(sourceVideo)
    let renderSize: CGSize = mode == "original" ? oriented : CGSize(width: 1080, height: 1920)
    let sx = renderSize.width / oriented.width, sy = renderSize.height / oriented.height
    let scale: CGFloat = mode == "crop916" ? max(sx, sy) : mode == "fit916" ? min(sx, sy) : 1.0
    let scaled = CGSize(width: oriented.width * scale, height: oriented.height * scale)
    let tx = (renderSize.width - scaled.width) / 2.0, ty = (renderSize.height - scaled.height) / 2.0
    var transform = base.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    transform = transform.concatenating(CGAffineTransform(translationX: tx / max(scale, 0.0001), y: ty / max(scale, 0.0001)))

    let instruction = AVMutableVideoCompositionInstruction(); instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack); layerInstruction.setTransform(transform, at: .zero); instruction.layerInstructions = [layerInstruction]
    let videoComposition = AVMutableVideoComposition(); videoComposition.renderSize = renderSize
    let fps = sourceVideo.nominalFrameRate > 0 ? min(sourceVideo.nominalFrameRate, 60.0) : 30.0
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(24.0, fps).rounded())); videoComposition.instructions = [instruction]

    let parent = CALayer(); parent.frame = CGRect(origin: .zero, size: renderSize); parent.backgroundColor = NSColor.black.cgColor
    let videoLayer = CALayer(); videoLayer.frame = parent.bounds; parent.addSublayer(videoLayer)
    let data = try Data(contentsOf: URL(fileURLWithPath: captionsPath)); let captions = (try? JSONDecoder().decode([Caption].self, from: data)) ?? []

    for c in captions {
        let layer = CATextLayer(); layer.contentsScale = 2.0; layer.alignmentMode = .center; layer.isWrapped = true
        let baseFont = renderSize.width * (captionStyle == "bold" ? 0.061 : captionStyle == "minimal" ? 0.044 : 0.052)
        let fontSize = max(28.0, baseFont)
        layer.string = attributedCaption(c.text, style: captionStyle, highlight: highlightKeywords, fontSize: fontSize)
        layer.cornerRadius = captionStyle == "minimal" ? 0 : 12
        layer.backgroundColor = captionStyle == "minimal" ? NSColor.clear.cgColor : NSColor(calibratedWhite: 0, alpha: captionStyle == "podcast" ? 0.78 : 0.58).cgColor
        let width = renderSize.width * (captionStyle == "bold" ? 0.92 : 0.86)
        let height = max(100.0, renderSize.height * (captionStyle == "bold" ? 0.13 : 0.105))
        let y = captionStyle == "podcast" ? renderSize.height * 0.15 : renderSize.height * 0.10
        layer.frame = CGRect(x: (renderSize.width-width)/2, y: y, width: width, height: height); layer.opacity = 0

        let opacity = CAKeyframeAnimation(keyPath: "opacity"); opacity.values=[0,1,1,0]; opacity.keyTimes=[0,0.03,0.95,1]; opacity.beginTime=AVCoreAnimationBeginTimeAtZero+c.start; opacity.duration=max(0.12,c.end-c.start); opacity.isRemovedOnCompletion=false; opacity.fillMode=.both; layer.add(opacity, forKey:"captionOpacity")
        if captionStyle == "dynamic" || captionStyle == "bold" {
            let pop = CAKeyframeAnimation(keyPath: "transform.scale"); pop.values = captionStyle == "bold" ? [0.90,1.06,1.0] : [0.96,1.02,1.0]; pop.keyTimes=[0,0.20,1]; pop.beginTime=AVCoreAnimationBeginTimeAtZero+c.start; pop.duration=min(0.28,max(0.16,c.end-c.start)); pop.isRemovedOnCompletion=false; pop.fillMode=.both; layer.add(pop,forKey:"captionPop")
        }
        parent.addSublayer(layer)
    }
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw RFError.message("Не удалось создать видео-экспорт") }
    let out = URL(fileURLWithPath: output); try? FileManager.default.removeItem(at: out); session.outputURL=out; session.outputFileType=.mp4; session.videoComposition=videoComposition; session.timeRange=CMTimeRange(start:.zero,duration:asset.duration); session.shouldOptimizeForNetworkUse=true
    try waitExport(session)
}

do {
    let args = CommandLine.arguments
    guard args.count >= 3 else { throw RFError.message("Usage: probe input | extract-audio input output | render input output captions.json mode style highlight") }
    switch args[1] {
    case "probe": try probe(args[2])
    case "extract-audio": guard args.count >= 4 else { throw RFError.message("extract-audio args missing") }; try extractAudio(args[2], args[3])
    case "render": guard args.count >= 8 else { throw RFError.message("render args missing") }; try render(args[2],args[3],args[4],args[5],args[6],args[7]=="1")
    default: throw RFError.message("Unknown command")
    }
} catch {
    fputs("\(error)\n", stderr); exit(1)
}
