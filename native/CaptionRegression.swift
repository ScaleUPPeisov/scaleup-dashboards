import Foundation
import AVFoundation
import AppKit
import CoreVideo

func waitWriter(_ writer: AVAssetWriter) throws {
    let sem = DispatchSemaphore(value: 0)
    writer.finishWriting { sem.signal() }
    sem.wait()
    if writer.status != .completed { throw NSError(domain: "RFTest", code: 1, userInfo: [NSLocalizedDescriptionKey: writer.error?.localizedDescription ?? "writer failed"]) }
}

func makeSolidVideo(_ url: URL) throws {
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    let width = 640, height = 360
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_500_000]
    ])
    let attrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? NSError(domain: "RFTest", code: 2) }
    writer.startSession(atSourceTime: .zero)
    for frame in 0..<48 {
        var px: CVPixelBuffer?
        guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &px) == kCVReturnSuccess, let buffer = px else { throw NSError(domain: "RFTest", code: 3) }
        CVPixelBufferLockBaseAddress(buffer, [])
        if let base = CVPixelBufferGetBaseAddress(buffer) {
            let count = (CVPixelBufferGetBytesPerRow(buffer) / 4) * height
            base.assumingMemoryBound(to: UInt32.self).initialize(repeating: 0xFFCC6650, count: count)
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
        guard adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: 24)) else { throw writer.error ?? NSError(domain: "RFTest", code: 4) }
    }
    input.markAsFinished()
    try waitWriter(writer)
}

func run(_ executable: String, _ args: [String]) throws {
    let p = Process(); p.executableURL = URL(fileURLWithPath: executable); p.arguments = args
    let err = Pipe(); p.standardError = err
    try p.run(); p.waitUntilExit()
    if p.terminationStatus != 0 {
        let msg = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "render failed"
        throw NSError(domain: "RFTest", code: Int(p.terminationStatus), userInfo: [NSLocalizedDescriptionKey: msg])
    }
}

let args = CommandLine.arguments
guard args.count >= 2 else { fatalError("helper path required") }
let helper = args[1]
let work = FileManager.default.temporaryDirectory.appendingPathComponent("rf-caption-test-\(UUID().uuidString)")
try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: work) }
let source = work.appendingPathComponent("source.mov")
let output = work.appendingPathComponent("output.mp4")
let captions = work.appendingPathComponent("captions.json")
let segments = work.appendingPathComponent("segments.json")
try makeSolidVideo(source)
try Data("[{\"start\":0.20,\"end\":1.55,\"text\":\"TEST CAPTION\"}]".utf8).write(to: captions)
try Data("[{\"start\":0.0,\"end\":1.9}]".utf8).write(to: segments)
try run(helper, ["render", source.path, output.path, captions.path, segments.path, "crop916", "bold", "0", "off"])

let asset = AVURLAsset(url: output)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let image = try generator.copyCGImage(at: CMTime(seconds: 0.80, preferredTimescale: 600), actualTime: nil)
guard image.width == 1080 && image.height == 1920 else { fatalError("unexpected output size") }
let bitmap = NSBitmapImageRep(cgImage: image)
var sampled = 0, dark = 0
let bands = [120...560, 1360...1800]
for band in bands {
    var y = band.lowerBound
    while y <= band.upperBound {
        var x = 70
        while x <= 1010 {
            if let c = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) {
                sampled += 1
                if max(c.redComponent, c.greenComponent, c.blueComponent) < 0.55 { dark += 1 }
            }
            x += 28
        }
        y += 28
    }
}
let ratio = sampled == 0 ? 0 : Double(dark) / Double(sampled)
if ratio < 0.055 { fatalError("caption overlay not detected, dark ratio=\(ratio)") }
print("RF_CAPTION_TEST_OK ratio=\(ratio)")
