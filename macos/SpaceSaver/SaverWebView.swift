import WebKit

/// Builds the configured `WKWebView` that renders the bundled space-screensaver.
/// Shared by both the `.saver` bundle (`SpaceSaverView`) and the standalone
/// `SpaceSaver.app`, so the load path, sync wiring and mute/storage bootstrap
/// live in exactly one place.
enum SaverWebView {

    /// One shared pool → all views in a single process share a `BroadcastChannel`
    /// (this is what makes cross-display sync work in the standalone app, where
    /// every display lives in one process — unlike the multi-process `.saver`).
    static let processPool = WKProcessPool()

    /// Locates the bundled standalone build inside the given bundle.
    static func htmlURL(in bundle: Bundle) -> URL? {
        bundle.url(forResource: "spacesaver", withExtension: "html")
    }

    static func make(frame: CGRect, htmlURL: URL, params: DisplayLayout.Params?) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.processPool = processPool
        config.suppressesIncrementalRendering = false

        // file:// documents get unique opaque origins by default, which would
        // isolate each display's BroadcastChannel. Relax that so the same-origin
        // file documents in one process can talk to each other.
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: bootstrapJS,
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        config.userContentController = controller

        let webView = WKWebView(frame: frame, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground") // no white flash
        webView.layer?.backgroundColor = NSColor.black.cgColor

        let url = DisplayLayout.contentURL(base: htmlURL, params: params)
        webView.loadFileURL(url, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        return webView
    }

    /// Runs before the page's own scripts. Two defensive jobs:
    /// 1. Force audio muted — a screensaver must be silent. (Audio also needs a
    ///    user gesture the saver never gets, so this is belt-and-suspenders.)
    /// 2. Give `localStorage` an in-memory fallback if the file:// origin denies
    ///    it, so the page can never crash reading/writing storage.
    static let bootstrapJS = """
    (function () {
      try {
        var t = '__ss_probe__';
        window.localStorage.setItem(t, '1');
        window.localStorage.removeItem(t);
      } catch (e) {
        var mem = {};
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          value: {
            getItem: function (k) { return k in mem ? mem[k] : null; },
            setItem: function (k, v) { mem[k] = String(v); },
            removeItem: function (k) { delete mem[k]; },
            clear: function () { mem = {}; },
            key: function (i) { return Object.keys(mem)[i] || null; },
            get length() { return Object.keys(mem).length; }
          }
        });
      }
      try { window.localStorage.setItem('spacesaver.muted', '1'); } catch (e) {}
    })();
    """
}
