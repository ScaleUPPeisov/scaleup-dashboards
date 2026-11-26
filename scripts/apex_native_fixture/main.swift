import AppKit
import WebKit
import Foundation
import Darwin

// Separate executable: never links VYRON, Tauri, OAuth, or production code.
final class FixtureAssets: NSObject, WKURLSchemeHandler {
    private let assets: [String: URL]
    init(root: URL) throws {
        let fm = FileManager.default
        var index = [String: URL]()
        let canonical = root.resolvingSymlinksInPath().standardizedFileURL
        guard let entries = fm.enumerator(at: canonical, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey], options: [.skipsHiddenFiles]) else {
            throw NSError(domain: "FixtureAssets", code: 1)
        }
        for case let url as URL in entries {
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            if values.isSymbolicLink == true { throw NSError(domain: "FixtureAssets", code: 2) }
            if values.isRegularFile != true { continue }
            let real = url.resolvingSymlinksInPath().standardizedFileURL
            guard real.path.hasPrefix(canonical.path + "/") else { throw NSError(domain: "FixtureAssets", code: 3) }
            let key = String(real.path.dropFirst(canonical.path.count))
            index[key] = real
        }
        guard index["/apex-interactive.html"] != nil else { throw NSError(domain: "FixtureAssets", code: 4) }
        assets = index
    }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == "apex-fixture", url.host == "preview",
              task.request.httpMethod == "GET" || task.request.httpMethod == nil,
              url.query == nil, url.user == nil, url.password == nil, url.port == nil,
              let file = assets[url.path], let bytes = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "APEX_FIXTURE_ASSET_DENIED", code: 403)); return
        }
        let mime: String
        switch file.pathExtension.lowercased() {
        case "html": mime = "text/html"
        case "js", "mjs": mime = "text/javascript"
        case "css": mime = "text/css"
        case "png": mime = "image/png"
        case "jpg", "jpeg": mime = "image/jpeg"
        case "webp": mime = "image/webp"
        case "svg": mime = "image/svg+xml"
        case "woff2": mime = "font/woff2"
        default: mime = "application/octet-stream"
        }
        let headers = ["Content-Type": mime, "Content-Length": String(bytes.count),
            "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; script-src 'self' apex-fixture:; style-src 'self' apex-fixture: 'unsafe-inline'; img-src 'self' apex-fixture: data: blob:; font-src 'self' apex-fixture: data:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(NSError(domain: "APEX_FIXTURE_ASSET_DENIED", code: 500)); return
        }
        task.didReceive(response); task.didReceive(bytes); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class FixtureApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow?
    private var view: WKWebView?
    private var assets: FixtureAssets?
    private let selfTest = CommandLine.arguments.contains("--self-test")
    private let routes = ["dashboard","channels","production","inventory","publisher","batch","metadata","uploads","schedule","existing","runway","analytics","winners","competitors","images","music","autopilot","history","accounts","settings","design"]
    private var tested = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        if selfTest { DispatchQueue.main.asyncAfter(deadline: .now() + 80) { self.finish(1, "NATIVE_FIXTURE_TIMEOUT") } }
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("preview", isDirectory: true),
              let assets = try? FixtureAssets(root: root) else { finish(1, "ASSETS_MISSING"); return }
        self.assets = assets
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(assets, forURLScheme: "apex-fixture")
        let blocked = [["trigger": ["url-filter":"^https?://"],"action":["type":"block"]],
                       ["trigger": ["url-filter":"^wss?://"],"action":["type":"block"]],
                       ["trigger": ["url-filter":"^file:"],"action":["type":"block"]]]
        guard let data = try? JSONSerialization.data(withJSONObject: blocked),
              let json = String(data: data, encoding: .utf8) else { finish(1, "RULES_INVALID"); return }
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "apex-fixture-no-external", encodedContentRuleList: json) { list, error in
            DispatchQueue.main.async {
                guard let list, error == nil else { self.finish(1, "RULES_FAILED"); return }
                configuration.userContentController.add(list)
                self.open(configuration)
            }
        }
    }
    private func open(_ configuration: WKWebViewConfiguration) {
        let view = WKWebView(frame: .init(x: 0, y: 0, width: 1360, height: 880), configuration: configuration)
        view.navigationDelegate = self; view.uiDelegate = self
        self.view = view
        let window = NSWindow(contentRect: .init(x: 0, y: 0, width: 1360, height: 880), styleMask: [.titled,.closable,.resizable,.miniaturizable], backing: .buffered, defer: false)
        window.title = "VYRON APEX — TEST ONLY"
        window.contentView = view; window.center(); self.window = window
        if !selfTest { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        view.load(URLRequest(url: URL(string: "apex-fixture://preview/apex-interactive.html")!))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let u = action.request.url
        decisionHandler(u?.scheme == "apex-fixture" && u?.host == "preview" && u?.path == "/apex-interactive.html" && action.targetFrame?.isMainFrame == true ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if selfTest && !tested { tested = true; waitForRoot(attempt: 0) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if selfTest { finish(1, "NAVIGATION_FAILED") } }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(1, "WEB_PROCESS_TERMINATED") }
    private func waitForRoot(attempt: Int) {
        guard attempt < 60 else { finish(1, "ROOT_MISSING"); return }
        view?.evaluateJavaScript("!!document.querySelector('[data-apex-page]')") { result, error in
            if (result as? Bool) == true { self.checkRoute(0) }
            else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitForRoot(attempt: attempt + 1) } }
        }
    }
    private func checkRoute(_ index: Int) {
        if index == routes.count { finish(0, "NATIVE_FIXTURE_ROUTES=21/21"); return }
        let route = routes[index]
        view?.evaluateJavaScript("document.querySelector('[data-apex-route=\"\(route)\"]').click()") { _, error in
            if error != nil { self.finish(1, "ROUTE_CLICK_FAILED \(route)"); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                self.view?.evaluateJavaScript("document.querySelector('[data-apex-page]')?.dataset.apexPage === '\(route)' && !document.querySelector('.uiErrorBoundary') && (document.querySelector('[data-apex-page]')?.innerText||'').length > 30") { result, _ in
                    if (result as? Bool) == true { print("ROUTE_PASS \(route)"); fflush(stdout); self.checkRoute(index+1) }
                    else { self.finish(1, "ROUTE_FAILED \(route)") }
                }
            }
        }
    }
    private func finish(_ code: Int32, _ message: String) { print(message); fflush(stdout); if selfTest || code != 0 { exit(code) } }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let delegate = FixtureApp()
app.delegate = delegate
app.setActivationPolicy(CommandLine.arguments.contains("--self-test") ? .prohibited : .regular)
app.run()
