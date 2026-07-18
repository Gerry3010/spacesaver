import AppKit

/// Derives, generically from the current `NSScreen` arrangement, the parameters
/// the web page needs to render one seamless world across every display:
///
/// - `view=x,y,W,H` — this screen shows the sub-rect at (x, y) of a virtual
///   canvas W×H that is the bounding box of *all* displays. The web camera
///   slices a single frustum with `camera.setViewOffset` (see `engine.setView`),
///   so stars/nebula/ship line up exactly across the physical bezels.
/// - `sync=master|follow` — one display simulates and publishes, the rest just
///   render (see `src/core/sync.js`).
///
/// Coordinate note: `NSScreen.frame` is y-*up* (origin bottom-left), the web
/// virtual canvas is y-*down* (top = 0). We flip y when computing the offset.
enum DisplayLayout {

    struct Params {
        /// Sub-rect offset of this display inside the virtual canvas (points).
        let x: CGFloat
        let y: CGFloat
        /// Virtual canvas = bounding box of all displays (points).
        let W: CGFloat
        let H: CGFloat
        /// `"master"`, `"follow"`, or `nil` for a solo screen (no sync at all).
        let role: String?
    }

    /// Returns `nil` for the solo case — preview thumbnails, or a single
    /// display — where the page should just run standalone with no view offset
    /// and no sync. Otherwise returns this screen's slice of the shared world.
    static func params(for screen: NSScreen?, isPreview: Bool) -> Params? {
        guard !isPreview, let screen else { return nil }

        let screens = NSScreen.screens
        guard screens.count > 1 else { return nil }

        // Bounding box over every display, in y-up point coordinates.
        let minX = screens.map { $0.frame.minX }.min() ?? 0
        let maxX = screens.map { $0.frame.maxX }.max() ?? 0
        let minY = screens.map { $0.frame.minY }.min() ?? 0
        let maxY = screens.map { $0.frame.maxY }.max() ?? 0

        let W = maxX - minX
        let H = maxY - minY

        let f = screen.frame
        let x = f.minX - minX
        let y = maxY - f.maxY // y-flip: web top edge is 0

        // The screen anchored at the global origin is the primary/menu-bar
        // display — a stable, deterministic choice for the simulating master.
        let primary = screens.first { $0.frame.origin == .zero } ?? screens.first
        let role = (screen == primary) ? "master" : "follow"

        return Params(x: x, y: y, W: W, H: H, role: role)
    }

    /// Builds the `file://…/spacesaver.html?…` URL, encoding the query safely
    /// (`loadFileURL` keeps a query, but the components must be percent-encoded).
    static func contentURL(base: URL, params: Params?) -> URL {
        guard let params,
              var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            return base
        }
        var items: [URLQueryItem] = []
        // Integer-format the offsets/size — the web side parses them with Number().
        let fmt = { (v: CGFloat) in String(Int(v.rounded())) }
        items.append(URLQueryItem(name: "view",
                                  value: "\(fmt(params.x)),\(fmt(params.y)),\(fmt(params.W)),\(fmt(params.H))"))
        if let role = params.role {
            items.append(URLQueryItem(name: "sync", value: role))
        }
        comps.queryItems = items
        return comps.url ?? base
    }
}
