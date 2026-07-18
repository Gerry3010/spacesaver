import Cocoa
import WebKit
import IOKit

// SpaceSaver.app — the standalone "screensaver mode" that actually works across
// displays on modern macOS. Unlike the `.saver` (which the legacyScreenSaver
// sandbox renders black and splits into one process per display), this app owns
// a single process, so WebGL renders and the `BroadcastChannel` sync ties every
// display into one seamless, in-lockstep world.
//
// Modes:
//   SpaceSaver.app                 → show immediately; any input quits.
//   SpaceSaver.app --watch [secs]  → agent that shows after `secs` idle
//                                     (default 300) and hides on input; the
//                                     real screensaver behaviour. Pair with the
//                                     sample LaunchAgent in macos/README.md.

/// System-wide idle time via IOHIDSystem — the rock-solid "seconds since the
/// last keyboard/mouse event", independent of app focus.
func systemIdleSeconds() -> Double {
    var iterator: io_iterator_t = 0
    guard IOServiceGetMatchingServices(kIOMainPortDefault,
                                       IOServiceMatching("IOHIDSystem"),
                                       &iterator) == KERN_SUCCESS else { return 0 }
    defer { IOObjectRelease(iterator) }
    let entry = IOIteratorNext(iterator)
    guard entry != 0 else { return 0 }
    defer { IOObjectRelease(entry) }

    var unmanaged: Unmanaged<CFMutableDictionary>?
    guard IORegistryEntryCreateCFProperties(entry, &unmanaged, kCFAllocatorDefault, 0) == KERN_SUCCESS,
          let props = unmanaged?.takeRetainedValue() as? [String: Any],
          let idleNs = props["HIDIdleTime"] as? UInt64 else { return 0 }
    return Double(idleNs) / 1_000_000_000.0
}

/// Owns the per-display overlay windows and the input-driven dismissal.
final class SaverController {
    private var windows: [NSWindow] = []
    private var localMonitor: Any?
    private var globalMonitor: Any?
    private var shownAt = Date.distantPast
    private(set) var isShowing = false

    /// Called when the user dismisses (input) — quit in immediate mode, hide in
    /// watch mode.
    var onDismiss: (() -> Void)?

    func show() {
        guard !isShowing else { return }
        guard let htmlURL = SaverWebView.htmlURL(in: .main) else {
            NSLog("[spacesaver] bundled spacesaver.html not found"); return
        }

        for screen in NSScreen.screens {
            let params = DisplayLayout.params(for: screen, isPreview: false)

            let host = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
            host.wantsLayer = true
            host.layer?.backgroundColor = NSColor.black.cgColor
            host.addSubview(SaverWebView.make(frame: host.bounds, htmlURL: htmlURL, params: params))

            let win = NSWindow(contentRect: screen.frame, styleMask: [.borderless],
                               backing: .buffered, defer: false, screen: screen)
            win.setFrame(screen.frame, display: true)
            win.level = .screenSaver
            win.backgroundColor = .black
            win.isOpaque = true
            win.hasShadow = false
            win.acceptsMouseMovedEvents = true
            win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
            win.contentView = host
            win.orderFrontRegardless()
            windows.append(win)
        }

        NSApp.activate(ignoringOtherApps: true)
        windows.first?.makeKey()
        NSCursor.hide()
        shownAt = Date()
        installMonitors()
        isShowing = true
    }

    func hide() {
        guard isShowing else { return }
        removeMonitors()
        NSCursor.unhide()
        for w in windows { w.orderOut(nil) }
        windows.removeAll() // drops the WKWebViews → stops rendering, frees GPU/CPU
        isShowing = false
    }

    // Any real input dismisses — but ignore the brief settle window right after
    // showing (activation itself can synthesise a mouse-moved event).
    private func dismiss() {
        guard isShowing, Date().timeIntervalSince(shownAt) > 0.6 else { return }
        onDismiss?()
    }

    private var dismissMask: NSEvent.EventTypeMask {
        [.mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown,
         .keyDown, .scrollWheel, .flagsChanged, .leftMouseDragged]
    }

    private func installMonitors() {
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: dismissMask) { [weak self] _ in
            self?.dismiss()
            return nil // swallow the dismissing event
        }
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: dismissMask) { [weak self] _ in
            self?.dismiss()
        }
    }

    private func removeMonitors() {
        if let m = localMonitor { NSEvent.removeMonitor(m); localMonitor = nil }
        if let m = globalMonitor { NSEvent.removeMonitor(m); globalMonitor = nil }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let controller = SaverController()
    private var watchTimer: Timer?
    private var idleThreshold: Double?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--watch") {
            let secs = (i + 1 < args.count ? Double(args[i + 1]) : nil) ?? 300
            startWatching(idleFor: secs)
        } else {
            controller.onDismiss = { NSApp.terminate(nil) }
            controller.show()
        }
    }

    private func startWatching(idleFor threshold: Double) {
        idleThreshold = threshold
        controller.onDismiss = { [weak self] in self?.controller.hide() }
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, let th = self.idleThreshold, !self.controller.isShowing else { return }
            if systemIdleSeconds() >= th { self.controller.show() }
        }
        RunLoop.main.add(timer, forMode: .common)
        watchTimer = timer
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // agent app: no Dock icon, no menu bar
app.run()
