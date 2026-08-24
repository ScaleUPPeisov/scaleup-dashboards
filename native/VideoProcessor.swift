import Foundation
import AVFoundation
import AppKit
import QuartzCore
import Vision
import CoreVideo

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

struct TrackGeometry {
    let preferredTransform: CGAffineTransform
    let orientedBounds: CGRect
    let orientedSize: CGSize
}

enum RFError: Error, CustomStringConvertible {
    case message(String)

    var description: String {
        if case let .message(value) = self { return value }
        return "ReelsFactory error"
    }
}

func clamp<T: Comparable>(_ value: T, _ lower: T, _ upper: T) -> T {
    return min(max(value, lower), upper)
}

func waitExport(_ session: AVAssetExportSession) throws {
    let semaphore = DispatchSemaphore(value: 0)
    session.exportAsynchronously { semaphore.signal() }
    semaphore.wait()
    if session.status != .completed {
        throw RFError.message(session.error?.localizedDescription ?? "Export failed: \(session.status.rawValue)")
    }
}

func waitWriter(_ writer: AVAssetWriter) throws {
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    if writer.status != .completed {
        throw RFError.message(writer.error?.localizedDescription ?? "Test writer failed: \(writer.status.rawValue)")
    }
}

func geometry(naturalSize: CGSize, preferredTransform: CGAffineTransform) -> TrackGeometry {
    let rawRect = CGRect(origin: .zero, size: naturalSize)
    let bounds = rawRect.applying(preferredTransform)
    let oriented = CGSize(width: abs(bounds.width), height: abs(bounds.height))
    return TrackGeometry(preferredTransform: preferredTransform, orientedBounds: bounds, orientedSize: oriented)
}

func geometry(_ track: AVAssetTrack) -> TrackGeometry {
    return geometry(naturalSize: track.naturalSize, preferredTransform: track.preferredTransform)
}

func probe(_ input: String) throws {
    let url = URL(fileURLWithPath: input)
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else {
        throw RFError.message("В файле нет видеодорожки")
    }

    let g = geometry(track)
    let attributes = try FileManager.default.attributesOfItem(atPath: input)
    let fileSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    let durationSeconds = CMTimeGetSeconds(asset.duration)

    let payload: [String: Any] = [
        "duration": durationSeconds.isFinite ? durationSeconds : 0,
        "width": Int(g.orientedSize.width.rounded()),
        "height": Int(g.orientedSize.height.rounded()),
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
    // v0.2.3: softer zooms. The old 8.5% jump looked like a camera error on portrait crops.
    let amount: CGFloat = mode == "dynamic" ? 1.055 : 1.025
    for caption in captions {
        guard emphasisScore(caption.text) >= 2 else { continue }
        let accentEnd = min(caption.end, caption.start + 0.70)
        if time >= caption.start && time <= accentEnd { return amount }
    }
    return 1.0
}

func detectFaceCenter(generator: AVAssetImageGenerator, at seconds: Double) -> CGFloat? {
    let time = CMTime(seconds: seconds, preferredTimescale: 600)
    guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { return nil }
    let faceRequest = VNDetectFaceRectanglesRequest()
    let humanRequest = VNDetectHumanRectanglesRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([faceRequest, humanRequest])
        if let faces = faceRequest.results, !faces.isEmpty {
            let best = faces.max { lhs, rhs in
                lhs.boundingBox.width * lhs.boundingBox.height < rhs.boundingBox.width * rhs.boundingBox.height
            }
            if let center = best.map({ CGFloat($0.boundingBox.midX) }) { return center }
        }
        // Talking-head footage often loses the face when the person leans down or turns away.
        // In that case keep the person in frame using the full human rectangle instead of snapping to center.
        if let humans = humanRequest.results, !humans.isEmpty {
            let best = humans.max { lhs, rhs in
                lhs.boundingBox.width * lhs.boundingBox.height < rhs.boundingBox.width * rhs.boundingBox.height
            }
            return best.map { CGFloat($0.boundingBox.midX) }
        }
        return nil
    } catch {
        return nil
    }
}

func buildFaceSamples(asset: AVAsset, segments: [EditSegment], enabled: Bool) -> [FaceSample] {
    guard enabled else { return [] }
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.10, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.10, preferredTimescale: 600)
    generator.maximumSize = CGSize(width: 720, height: 720)

    var result: [FaceSample] = []
    var outputCursor = 0.0
    var smoothed: CGFloat?
    var misses = 0

    for (segmentIndex, segment) in segments.enumerated() {
        // After a real Smart Cut, reacquire instead of dragging the previous shot's crop into the new shot.
        if segmentIndex > 0 {
            smoothed = nil
            misses = 0
        }
        let duration = max(0.0, segment.end - segment.start)
        var local = 0.0
        while local <= duration + 0.001 {
            let sourceTime = min(segment.end, segment.start + local)
            let detected = detectFaceCenter(generator: generator, at: sourceTime)
            if let detected {
                let safeDetected = clamp(detected, CGFloat(0.04), CGFloat(0.96))
                if let old = smoothed {
                    // Limit per-sample camera travel, then low-pass it to stop nervous horizontal shaking.
                    let limited = old + clamp(safeDetected - old, CGFloat(-0.055), CGFloat(0.055))
                    smoothed = old * 0.82 + limited * 0.18
                } else {
                    smoothed = safeDetected
                }
                misses = 0
            } else {
                misses += 1
                // If Vision loses the face, gently return toward center instead of freezing at an old edge forever.
                if misses >= 4, let old = smoothed {
                    smoothed = old * 0.94 + 0.5 * 0.06
                }
            }
            result.append(FaceSample(outputTime: outputCursor + local, centerX: smoothed))
            local += 0.35
        }
        outputCursor += duration
    }
    return result
}

func framingTransform(
    geometry g: TrackGeometry,
    renderSize: CGSize,
    mode: String,
    faceCenterX: CGFloat?,
    zoom: CGFloat
) -> CGAffineTransform {
    let orientedSize = g.orientedSize
    guard orientedSize.width > 0, orientedSize.height > 0 else { return .identity }

    let sx = renderSize.width / orientedSize.width
    let sy = renderSize.height / orientedSize.height
    let baseScale: CGFloat
    switch mode {
    case "crop916", "face916": baseScale = max(sx, sy)
    case "fit916": baseScale = min(sx, sy)
    default: baseScale = 1.0
    }

    let finalScale = baseScale * max(CGFloat(1.0), zoom)
    let scaledWidth = orientedSize.width * finalScale
    let scaledHeight = orientedSize.height * finalScale

    var offsetX = (renderSize.width - scaledWidth) / 2.0
    if mode == "face916", let rawFaceCenterX = faceCenterX {
        var face = clamp(rawFaceCenterX, CGFloat(0.04), CGFloat(0.96))
        // Dead-zone around the center prevents tiny face detector fluctuations from moving the camera.
        if abs(face - 0.5) < 0.055 { face = 0.5 }
        let desired = renderSize.width * 0.50 - orientedSize.width * face * finalScale
        let lower = min(CGFloat(0), renderSize.width - scaledWidth)
        let upper = max(CGFloat(0), renderSize.width - scaledWidth)
        offsetX = clamp(desired, lower, upper)
    }
    let offsetY = (renderSize.height - scaledHeight) / 2.0

    // IMPORTANT: build the final matrix explicitly in OUTPUT coordinates.
    // The previous concatenation order applied part of the translation in pre-rotation/source
    // coordinates, which could push the image outside the 1080x1920 canvas and expose black bars.
    let p = g.preferredTransform
    return CGAffineTransform(
        a: p.a * finalScale,
        b: p.b * finalScale,
        c: p.c * finalScale,
        d: p.d * finalScale,
        tx: (p.tx - g.orientedBounds.minX) * finalScale + offsetX,
        ty: (p.ty - g.orientedBounds.minY) * finalScale + offsetY
    )
}

func interpolatedFace(at time: Double, samples: [FaceSample]) -> CGFloat? {
    guard let first = samples.first else { return nil }
    if time <= first.outputTime { return first.centerX }
    guard let last = samples.last else { return first.centerX }
    if time >= last.outputTime { return last.centerX }

    for index in 0..<(samples.count - 1) {
        let a = samples[index]
        let b = samples[index + 1]
        guard time >= a.outputTime && time <= b.outputTime else { continue }
        switch (a.centerX, b.centerX) {
        case let (.some(x1), .some(x2)):
            let span = max(0.0001, b.outputTime - a.outputTime)
            let t = CGFloat((time - a.outputTime) / span)
            return x1 + (x2 - x1) * t
        case let (.some(x), .none): return x
        case let (.none, .some(x)): return x
        default: return nil
        }
    }
    return last.centerX
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

    let sourceGeometry = geometry(sourceVideo)
    let renderSize: CGSize = mode == "original" ? sourceGeometry.orientedSize : CGSize(width: 1080, height: 1920)
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
        tick += 0.35
    }
    for sample in faceSamples { timeline.insert(sample.outputTime) }
    for caption in captions {
        timeline.insert(caption.start)
        timeline.insert(min(caption.end, caption.start + 0.70))
        timeline.insert(caption.end)
    }
    let times = timeline.filter { $0 >= 0 && $0 <= outputDuration }.sorted()

    func transform(at time: Double) -> CGAffineTransform {
        return framingTransform(
            geometry: sourceGeometry,
            renderSize: renderSize,
            mode: mode,
            faceCenterX: interpolatedFace(at: time, samples: faceSamples),
            zoom: zoomFactor(at: time, captions: captions, mode: zoomMode)
        )
    }

    if times.count <= 1 {
        layerInstruction.setTransform(transform(at: 0), at: .zero)
    } else {
        for index in 0..<(times.count - 1) {
            let startSeconds = times[index]
            let endSeconds = times[index + 1]
            if endSeconds - startSeconds < 0.01 { continue }
            layerInstruction.setTransformRamp(
                fromStart: transform(at: startSeconds),
                toEnd: transform(at: endSeconds),
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
            pop.values = captionStyle == "bold" ? [0.92, 1.035, 1.0] : [0.97, 1.018, 1.0]
            pop.keyTimes = [0, 0.20, 1]
            pop.beginTime = AVCoreAnimationBeginTimeAtZero + caption.start
            pop.duration = min(0.25, max(0.16, caption.end - caption.start))
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

// MARK: - Built-in export regression tests

func assertCropCoverage(naturalSize: CGSize, preferredTransform: CGAffineTransform, faceCenter: CGFloat?) throws {
    let g = geometry(naturalSize: naturalSize, preferredTransform: preferredTransform)
    let renderSize = CGSize(width: 1080, height: 1920)
    let t = framingTransform(geometry: g, renderSize: renderSize, mode: faceCenter == nil ? "crop916" : "face916", faceCenterX: faceCenter, zoom: 1)
    let bounds = CGRect(origin: .zero, size: naturalSize).applying(t)
    let tolerance: CGFloat = 0.75
    guard bounds.minX <= tolerance,
          bounds.minY <= tolerance,
          bounds.maxX >= renderSize.width - tolerance,
          bounds.maxY >= renderSize.height - tolerance else {
        throw RFError.message("Geometry self-test exposed canvas gap: \(bounds)")
    }
    let values = [t.a, t.b, t.c, t.d, t.tx, t.ty]
    guard values.allSatisfy({ $0.isFinite }) else {
        throw RFError.message("Geometry self-test produced non-finite transform")
    }
}

func makeTestVideo(_ output: String, transform: CGAffineTransform) throws {
    let url = URL(fileURLWithPath: output)
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    let width = 640
    let height = 360
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_200_000]
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    input.transform = transform
    let attrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
    guard writer.canAdd(input) else { throw RFError.message("Self-test writer input unsupported") }
    writer.add(input)
    guard writer.startWriting() else { throw RFError.message(writer.error?.localizedDescription ?? "Self-test writer start failed") }
    writer.startSession(atSourceTime: .zero)

    for frame in 0..<24 {
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &buffer)
        guard status == kCVReturnSuccess, let pixelBuffer = buffer else {
            throw RFError.message("Self-test pixel buffer failed")
        }
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        if let base = CVPixelBufferGetBaseAddress(pixelBuffer) {
            let count = (CVPixelBufferGetBytesPerRow(pixelBuffer) / MemoryLayout<UInt32>.size) * height
            base.assumingMemoryBound(to: UInt32.self).initialize(repeating: 0xFFCC6650, count: count)
        }
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.003) }
        let time = CMTime(value: CMTimeValue(frame), timescale: 24)
        guard adaptor.append(pixelBuffer, withPresentationTime: time) else {
            throw RFError.message(writer.error?.localizedDescription ?? "Self-test frame append failed")
        }
    }
    input.markAsFinished()
    try waitWriter(writer)
}

func validateNoBlackBars(_ path: String) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    let image = try generator.copyCGImage(at: CMTime(seconds: 0.45, preferredTimescale: 600), actualTime: nil)
    guard image.width == 1080, image.height == 1920 else {
        throw RFError.message("Self-test output size is \(image.width)x\(image.height), expected 1080x1920")
    }
    let bitmap = NSBitmapImageRep(cgImage: image)
    let inset = 12
    var points: [(Int, Int)] = []
    for i in 0..<18 {
        let y = inset + i * (image.height - inset * 2 - 1) / 17
        points.append((inset, y))
        points.append((image.width - inset - 1, y))
        let x = inset + i * (image.width - inset * 2 - 1) / 17
        points.append((x, inset))
        points.append((x, image.height - inset - 1))
    }
    for (x, y) in points {
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else {
            throw RFError.message("Self-test could not sample output pixel")
        }
        let brightness = max(color.redComponent, color.greenComponent, color.blueComponent)
        if brightness < 0.12 {
            throw RFError.message("Self-test detected black canvas gap at \(x),\(y)")
        }
    }
}

func runSelfTest() throws {
    let landscape = CGSize(width: 1920, height: 1080)
    let identity = CGAffineTransform.identity
    let rotate90 = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 1080, ty: 0)
    let rotateMinus90 = CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 1920)
    let rotate180 = CGAffineTransform(a: -1, b: 0, c: 0, d: -1, tx: 1920, ty: 1080)
    for transform in [identity, rotate90, rotateMinus90, rotate180] {
        try assertCropCoverage(naturalSize: landscape, preferredTransform: transform, faceCenter: nil)
        for face in [CGFloat(0.08), CGFloat(0.25), CGFloat(0.50), CGFloat(0.75), CGFloat(0.92)] {
            try assertCropCoverage(naturalSize: landscape, preferredTransform: transform, faceCenter: face)
        }
    }

    let work = FileManager.default.temporaryDirectory.appendingPathComponent("reelsfactory-selftest-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: work) }
    let captions = work.appendingPathComponent("captions.json")
    let segments = work.appendingPathComponent("segments.json")
    try Data("[]".utf8).write(to: captions)
    try JSONEncoder().encode([EditSegment(start: 0, end: 0.95)]).write(to: segments)

    let sourceLandscape = work.appendingPathComponent("landscape.mov")
    let outputLandscape = work.appendingPathComponent("landscape-out.mp4")
    try makeTestVideo(sourceLandscape.path, transform: .identity)
    try render(sourceLandscape.path, outputLandscape.path, captions.path, segments.path, "crop916", "clean", false, "off")
    try validateNoBlackBars(outputLandscape.path)

    let sourceRotated = work.appendingPathComponent("rotated.mov")
    let outputRotated = work.appendingPathComponent("rotated-out.mp4")
    let rotatedMetadata = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 360, ty: 0)
    try makeTestVideo(sourceRotated.path, transform: rotatedMetadata)
    try render(sourceRotated.path, outputRotated.path, captions.path, segments.path, "face916", "clean", false, "off")
    try validateNoBlackBars(outputRotated.path)

    print("RF_SELF_TEST_OK geometry+landscape+rotated-metadata no-black-bars")
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 2 else {
        throw RFError.message("Usage: self-test | probe input | extract-audio input output | render input output captions.json segments.json mode style highlight zoom")
    }

    switch arguments[1] {
    case "self-test":
        try runSelfTest()
    case "probe":
        guard arguments.count >= 3 else { throw RFError.message("probe args missing") }
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
