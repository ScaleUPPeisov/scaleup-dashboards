// Synthetic WebKit fixture. No VYRON app, user data, or visible window.
import AppKit
import WebKit
import Foundation
import Darwin

final class Probe: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private(set) var webView: WKWebView!
    private var finished = false
    private var protected = false

    func start(port: Int, token: String, mode: String, rulesDirectory: String) {
        protected = mode != "control"
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.finish("timeout") }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore.nonPersistent()
        configuration.userContentController.add(self, name: "probe")
        if protected {
            let patterns = mode.hasPrefix("all-") ? ["^https?://", "^wss?://"] :
                ["fetch", "xhr", "beacon", "websocket", "stylesheet", "import", "image", "iframe", "redirect-target"].map { "/" + $0 + "$" }
            let ruleList: [[String: Any]] = patterns.map {
                ["trigger": ["url-filter": $0], "action": ["type": "block"]]
            }
            guard let data = try? JSONSerialization.data(withJSONObject: ruleList),
                  let json = String(data: data, encoding: .utf8),
                  let store = WKContentRuleListStore(url: URL(fileURLWithPath: rulesDirectory, isDirectory: true)) else {
                finish("RULELIST_ERROR"); return
            }
            let applyRules: (WKContentRuleList?, Error?) -> Void = { [weak self] list, error in
                guard let self, let list, error == nil else {
                    if let error = error as NSError? { print("RULELIST_ERROR_CODE \(error.code)"); fflush(stdout) }
                    self?.finish("RULELIST_ERROR"); return
                }
                configuration.userContentController.add(list)
                self.load(configuration: configuration, port: port, token: token)
            }
            // filter-control compiles the fixture before entering Seatbelt;
            // protected mode can only look up those precompiled rules.
            let identifier = mode.hasPrefix("all-") ? "fixture-all" : "fixture"
            if mode == "protected" || mode == "all-protected" {
                store.lookUpContentRuleList(forIdentifier: identifier, completionHandler: applyRules)
            } else {
                store.compileContentRuleList(forIdentifier: identifier, encodedContentRuleList: json, completionHandler: applyRules)
            }
        } else {
            load(configuration: configuration, port: port, token: token)
        }
    }

    private func load(configuration: WKWebViewConfiguration, port: Int, token: String) {
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 200, height: 100), configuration: configuration)
        webView.navigationDelegate = self
        let html = """
        <!doctype html><html><body><script>
        window.webkit.messageHandlers.probe.postMessage('started');
        const root='http://127.0.0.1:\(port)/\(token)/';
        fetch(root+'fetch', {mode:'no-cors', cache:'no-store'}).catch(()=>{});
        const xhr=new XMLHttpRequest(); xhr.open('GET',root+'xhr'); xhr.send();
        navigator.sendBeacon(root+'beacon','fixture');
        new WebSocket('ws://127.0.0.1:\(port)/\(token)/websocket');
        const style=document.createElement('link'); style.rel='stylesheet'; style.href=root+'stylesheet'; document.head.appendChild(style);
        const image=new Image(); image.src=root+'image'; document.body.appendChild(image);
        const frame=document.createElement('iframe'); frame.src=root+'iframe'; document.body.appendChild(frame);
        fetch(root+'redirect', {mode:'no-cors', cache:'no-store'}).catch(()=>{});
        setTimeout(()=>window.webkit.messageHandlers.probe.postMessage('finished'), 3500);
        </script></body></html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "about:blank"))
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = navigationAction.request.url?.scheme?.lowercased()
        if protected && (scheme == "http" || scheme == "https") { decisionHandler(.cancel) }
        else { decisionHandler(.allow) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let value = message.body as? String else { return }
        switch value {
        case "started": print("FIXTURE_STARTED"); fflush(stdout)
        case "finished": finish("FIXTURE_FINISHED")
        default: break
        }
    }

    private func finish(_ status: String) {
        if finished { return }
        finished = true
        print(status); fflush(stdout)
        if let webView {
            webView.stopLoading()
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "probe")
        }
        // This executable is a disposable fixture, not the application.
        // Terminate after emitting evidence; AppKit's run loop can otherwise
        // stay alive even after stop/CFRunLoopStop in a headless process.
        exit(0)
    }
}

guard CommandLine.arguments.count == 5, let port = Int(CommandLine.arguments[1]),
      (1...65535).contains(port), CommandLine.arguments[2].count == 32,
      CommandLine.arguments[2].allSatisfy({ $0.isHexDigit }),
      ["control", "filter-control", "protected", "all-control", "all-protected"].contains(CommandLine.arguments[3]) else { exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let probe = Probe()
probe.start(port: port, token: CommandLine.arguments[2], mode: CommandLine.arguments[3], rulesDirectory: CommandLine.arguments[4])
app.run()
