import Foundation
import AVFoundation
import AppKit
import QuartzCore

struct Caption: Codable { let start: Double; let end: Double; let text: String }

enum RFError: Error, CustomStringConvertible {
    case message(String)
    var description: String { if case let .message(s)=self{return s}; return "ReelsFactory error" }
}

func waitExport(_ session: AVAssetExportSession) throws {
    let sem = DispatchSemaphore(value: 0)
    session.exportAsynchronously { sem.signal() }
    sem.wait()
    if session.status != .completed { throw RFError.message(session.error?.localizedDescription ?? "Export failed: \(session.status.rawValue)") }
}

func extractAudio(_ input: String, _ output: String) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { throw RFError.message("Не удалось создать аудио-экспорт") }
    let out = URL(fileURLWithPath: output); try? FileManager.default.removeItem(at: out)
    session.outputURL = out; session.outputFileType = .m4a; session.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    try waitExport(session)
}

func normalizedTransform(_ track: AVAssetTrack) -> (CGAffineTransform, CGSize) {
    let natural = track.naturalSize
    let transformed = CGRect(origin: .zero, size: natural).applying(track.preferredTransform)
    let size = CGSize(width: abs(transformed.width), height: abs(transformed.height))
    var t = track.preferredTransform
    let origin = CGRect(origin: .zero, size: natural).applying(t).origin
    t = t.concatenating(CGAffineTransform(translationX: -origin.x, y: -origin.y))
    return (t,size)
}

func render(_ input: String, _ output: String, _ captionsPath: String, _ mode: String) throws {
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
    let scale: CGFloat = mode == "crop916" ? max(sx,sy) : (mode == "fit916" ? min(sx,sy) : 1.0)
    let scaled = CGSize(width: oriented.width * scale, height: oriented.height * scale)
    let tx = (renderSize.width - scaled.width) / 2.0, ty = (renderSize.height - scaled.height) / 2.0
    let transform = base.concatenating(CGAffineTransform(scaleX: scale, y: scale)).concatenating(CGAffineTransform(translationX: tx/scale, y: ty/scale))

    let instruction = AVMutableVideoCompositionInstruction(); instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack); layerInstruction.setTransform(transform, at: .zero)
    instruction.layerInstructions = [layerInstruction]
    let videoComposition = AVMutableVideoComposition(); videoComposition.renderSize = renderSize
    let fps = sourceVideo.nominalFrameRate > 0 ? min(sourceVideo.nominalFrameRate,60) : 30
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(24,fps)))
    videoComposition.instructions = [instruction]

    let parent = CALayer(); parent.frame = CGRect(origin:.zero,size:renderSize); parent.backgroundColor = NSColor.black.cgColor
    let videoLayer = CALayer(); videoLayer.frame = parent.bounds; parent.addSublayer(videoLayer)
    let data = try Data(contentsOf: URL(fileURLWithPath: captionsPath)); let captions = (try? JSONDecoder().decode([Caption].self, from:data)) ?? []
    for c in captions {
        let text = CATextLayer(); text.contentsScale = 2.0; text.string = c.text.uppercased(); text.alignmentMode = .center; text.isWrapped = true
        text.foregroundColor = NSColor.white.cgColor; text.backgroundColor = NSColor(calibratedWhite:0,alpha:0.58).cgColor; text.cornerRadius = 12
        let fontSize = max(30, renderSize.width * 0.052); text.fontSize = fontSize; text.font = NSFont.boldSystemFont(ofSize:fontSize)
        let w = renderSize.width * 0.88, h = max(105, renderSize.height * 0.11)
        text.frame = CGRect(x:(renderSize.width-w)/2,y:renderSize.height*0.10,width:w,height:h)
        text.opacity = 0
        let anim = CAKeyframeAnimation(keyPath:"opacity"); anim.values=[0,1,1,0]; anim.keyTimes=[0,0.02,0.96,1]; anim.beginTime=c.start; anim.duration=max(0.12,c.end-c.start); anim.isRemovedOnCompletion=false; anim.fillMode=.both
        text.add(anim,forKey:"caption"); parent.addSublayer(text)
    }
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw RFError.message("Не удалось создать видео-экспорт") }
    let out = URL(fileURLWithPath: output); try? FileManager.default.removeItem(at:out)
    session.outputURL=out; session.outputFileType=.mp4; session.videoComposition=videoComposition; session.timeRange=CMTimeRange(start:.zero,duration:asset.duration); session.shouldOptimizeForNetworkUse=true
    try waitExport(session)
}

do {
    let a = CommandLine.arguments
    guard a.count >= 4 else { throw RFError.message("Usage: extract-audio input output | render input output captions.json mode") }
    if a[1] == "extract-audio" { try extractAudio(a[2],a[3]) }
    else if a[1] == "render" { guard a.count >= 6 else { throw RFError.message("render args missing") }; try render(a[2],a[3],a[4],a[5]) }
    else { throw RFError.message("Unknown command") }
} catch { fputs("\(error)\n",stderr); exit(1) }
