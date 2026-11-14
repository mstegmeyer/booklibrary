import SwiftUI
import WebKit

/// The server's web interface with the bridge described in
/// apps/web/src/lib/app-shell.ts.
struct WebView: UIViewRepresentable {
    let server: URL
    let shell: Shell

    func makeCoordinator() -> Coordinator {
        Coordinator(server: server, shell: shell)
    }

    func makeUIView(context: Context) -> ScannerHostView {
        let coordinator = context.coordinator
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addScriptMessageHandler(coordinator, contentWorld: .page, name: "bookLibrary")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = coordinator
        webView.uiDelegate = coordinator
        // The web interface pads itself with env(safe-area-inset-*).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = UIColor(Color.ground)
        coordinator.webView = webView
        webView.load(URLRequest(url: server))
        return ScannerHostView(webView: webView, previewLayer: coordinator.scanner.previewLayer)
    }

    func updateUIView(_ view: ScannerHostView, context: Context) {}

    static func dismantleUIView(_ view: ScannerHostView, coordinator: Coordinator) {
        coordinator.stopScan()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
        let server: URL
        let shell: Shell
        let scanner = Scanner()
        private let scanFeedback = UIImpactFeedbackGenerator(style: .medium)
        weak var webView: WKWebView?

        init(server: URL, shell: Shell) {
            self.server = server
            self.shell = shell
            super.init()
            scanner.onCode = { [weak self] code in
                self?.scanFeedback.impactOccurred()
                self?.webView?.callAsyncJavaScript(
                    "window.dispatchEvent(new CustomEvent('booklibrary:barcode', { detail: code }))",
                    arguments: ["code": code], in: nil, in: .page
                )
            }
        }

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage,
            replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
        ) {
            guard message.frameInfo.isMainFrame, isServer(message.frameInfo.request.url),
                  let body = message.body as? [String: Any], let action = body["action"] as? String
            else { return replyHandler(nil, "unknown") }
            switch action {
            case "changeServer":
                replyHandler(nil, nil)
                shell.changeServer()
            case "startScan":
                Task {
                    do throws(ScanError) {
                        try await scanner.start()
                        setTransparent(true)
                        replyHandler(nil, nil)
                    } catch {
                        replyHandler(nil, error.rawValue)
                    }
                }
            case "stopScan":
                stopScan()
                replyHandler(nil, nil)
            case "setLightStatusBar":
                shell.lightStatusBar = body["light"] as? Bool == true
                replyHandler(nil, nil)
            case "checkTorch":
                replyHandler(nil, Scanner.hasTorch ? nil : ScanError.unavailable.rawValue)
            case "setTorch":
                do throws(ScanError) {
                    try scanner.setTorch(body["on"] as? Bool == true)
                    replyHandler(nil, nil)
                } catch {
                    replyHandler(nil, error.rawValue)
                }
            default:
                replyHandler(nil, "unknown")
            }
        }

        func stopScan() {
            scanner.stop()
            setTransparent(false)
        }

        private func setTransparent(_ transparent: Bool) {
            guard let webView else { return }
            webView.isOpaque = !transparent
            webView.backgroundColor = transparent ? .clear : UIColor(Color.ground)
            webView.scrollView.backgroundColor = webView.backgroundColor
            scanner.previewLayer.isHidden = !transparent
        }

        private func isServer(_ url: URL?) -> Bool {
            url?.scheme == server.scheme && url?.host() == server.host() && url?.port == server.port
        }

        // Other sites open in the browser, so the app only ever shows its server.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url, action.targetFrame?.isMainFrame != false,
                  !isServer(url), url.scheme != "about", url.scheme != "blob", url.scheme != "data"
            else { return decisionHandler(.allow) }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url { UIApplication.shared.open(url) }
            return nil
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            stopScan()
            shell.lightStatusBar = false
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let error = error as NSError
            guard error.domain == NSURLErrorDomain, error.code != NSURLErrorCancelled else { return }
            shell.lostServer(error)
        }
    }
}

/// Holds the camera preview behind the web view.
final class ScannerHostView: UIView {
    private let previewLayer: CALayer

    init(webView: WKWebView, previewLayer: CALayer) {
        self.previewLayer = previewLayer
        super.init(frame: .zero)
        previewLayer.isHidden = true
        layer.addSublayer(previewLayer)
        webView.frame = bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(webView)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer.frame = bounds
    }
}
