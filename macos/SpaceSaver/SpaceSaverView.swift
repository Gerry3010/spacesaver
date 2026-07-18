import ScreenSaver
import WebKit

/// `spacesaver.saver` — renders the web space-screensaver across every display
/// as one continuous world. macOS instantiates one `SpaceSaverView` per screen;
/// each hosts a `WKWebView` loading the bundled standalone build with the right
/// `?view=…&sync=…` for its slice of the virtual canvas (see `DisplayLayout`).
///
/// ⚠️ Sandbox caveat (macOS 14+, verified on 26.5): inside `legacyScreenSaver`
/// the WebGL canvas renders black and macOS runs one process per display (so
/// `BroadcastChannel` can't sync across displays). This target is kept for the
/// native System-Settings integration and in case Apple relaxes the sandbox;
/// the working, seamless, synced experience ships as `SpaceSaver.app` (Plan B).
/// See `macos/README.md`.
@objc(SpaceSaverView)
final class SpaceSaverView: ScreenSaverView {

    private var webView: WKWebView?
    private var didLoad = false

    // MARK: Lifecycle

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 / 30.0
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// The window (and therefore the target `NSScreen`) only exists once we are
    /// in the hierarchy — build and load the web view exactly once here.
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard window != nil, !didLoad else { return }
        didLoad = true
        setUpWebView()
    }

    // MARK: Web view

    private func setUpWebView() {
        guard let htmlURL = SaverWebView.htmlURL(in: Bundle(for: Self.self)) else {
            NSLog("[spacesaver] bundled spacesaver.html not found")
            return
        }
        let params = DisplayLayout.params(for: window?.screen, isPreview: isPreview)
        let webView = SaverWebView.make(frame: bounds, htmlURL: htmlURL, params: params)
        addSubview(webView)
        self.webView = webView
    }

    // MARK: Animation (WKWebView renders itself via rAF; nothing to do per frame)

    override func startAnimation() { super.startAnimation() }
    override func stopAnimation() { super.stopAnimation() }
    override func animateOneFrame() {}
}
