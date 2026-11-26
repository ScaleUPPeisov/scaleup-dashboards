// Disposable fixture: no VYRON code, credentials, user files, or window.
import AppKit
import WebKit
import Foundation
import Darwin

func checkRead(_ url: URL) -> String {
    do { _ = try Data(contentsOf: url); return "allowed" }
    catch {
        let ns = error as NSError
        if (ns.domain == NSCocoaErrorDomain && ns.code == NSFileReadNoPermissionError) ||
           (ns.domain == NSPOSIXErrorDomain && (ns.code == Int(EACCES) || ns.code == Int(EPERM))) {
            return "denied"
        }
        return "error"
    }
}

final class ReadFixture: NSObject, WKScriptMessageHandler {
    private(set) var view: WKWebView!
    private var results = [String: String]()
    private var ended = false

    func start(_ base: URL) {
        let privateRoot = base.appendingPathComponent("private")
        let media = base.appendingPathComponent("media/media.png")
        let foreign = base.appendingPathComponent("foreign/foreign.png")
        print("PARENT_PRIVATE_\(checkRead(privateRoot.appendingPathComponent("sentinel")).uppercased())")
        print("PARENT_MEDIA_\(checkRead(media).uppercased())")
        print("PARENT_FOREIGN_\(checkRead(foreign).uppercased())")
        fflush(stdout)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "probe")
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 100, height: 100), configuration: configuration)
        view.loadFileURL(privateRoot.appendingPathComponent("index.html"), allowingReadAccessTo: base)
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.finish("TIMEOUT") }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let value = message.body as? String else { return }
        if value == "started" { print("FIXTURE_STARTED"); fflush(stdout); return }
        let parts = value.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, ["media", "foreign"].contains(parts[0]), ["loaded", "error"].contains(parts[1]) else { return }
        results[parts[0]] = parts[1]
        if results.count == 2 { finish("FIXTURE_FINISHED") }
    }

    private func finish(_ status: String) {
        guard !ended else { return }; ended = true
        for name in ["media", "foreign"] {
            if let value = results[name] { print("WEBKIT_\(name.uppercased())_\(value.uppercased())") }
        }
        print(status); fflush(stdout)
        if let view { view.stopLoading(); view.configuration.userContentController.removeScriptMessageHandler(forName: "probe") }
        exit(0)
    }
}

guard CommandLine.arguments.count == 2 else { exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let fixture = ReadFixture()
fixture.start(URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true))
app.run()
