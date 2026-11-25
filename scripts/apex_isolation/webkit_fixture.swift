// Synthetic fixture only. It does not load VYRON or user files and creates no window.
import AppKit
import WebKit
import Foundation
import Darwin

final class Probe: NSObject, WKScriptMessageHandler {
    private(set) var webView: WKWebView!
    private var finished = false

    func start(port: Int, token: String) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore.nonPersistent()
        configuration.userContentController.add(self, name: "probe")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 200, height: 100), configuration: configuration)
        let html = """
        <!doctype html><html><body><script>
        window.webkit.messageHandlers.probe.postMessage('started');
        fetch('http://127.0.0.1:\(port)/\(token)', {mode:'no-cors', cache:'no-store'})
          .then(() => window.webkit.messageHandlers.probe.postMessage('fetch_finished'))
          .catch(() => window.webkit.messageHandlers.probe.postMessage('fetch_failed'));
        </script></body></html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "http://127.0.0.1:\(port)/"))
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in self?.finish("timeout") }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let value = message.body as? String else { return }
        switch value {
        case "started": print("FIXTURE_STARTED"); fflush(stdout)
        case "fetch_finished": finish("FETCH_FINISHED")
        case "fetch_failed": finish("FETCH_FAILED")
        default: break
        }
    }

    private func finish(_ status: String) {
        if finished { return }
        finished = true
        print(status); fflush(stdout)
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "probe")
        // Fixture-only process; don't rely on an invisible AppKit run loop
        // exiting after stop while preserving the captured evidence.
        exit(0)
    }
}

guard CommandLine.arguments.count == 3, let port = Int(CommandLine.arguments[1]),
      (1...65535).contains(port), CommandLine.arguments[2].allSatisfy({ $0.isHexDigit }),
      CommandLine.arguments[2].count == 32 else { exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let probe = Probe()
probe.start(port: port, token: CommandLine.arguments[2])
app.run()
