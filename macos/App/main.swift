import Cocoa
import WebKit
import IOKit

// SpaceSaver.app — a menu-bar app that runs the web space-screensaver across all
// displays. Unlike the `.saver` (which the legacyScreenSaver sandbox renders
// black and splits into one process per display), this app owns a single
// process, so WebGL renders and the `BroadcastChannel` sync ties every display
// into one seamless, in-lockstep world.
//
// It lives in the menu bar: pick the idle delay before the screensaver kicks in
// (1–30 min), "Jetzt spielen" to drop straight into multi-display Coin Rush, or
// quit. `--watch [secs]` still works as a headless override for scripting.

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

/// A borderless window still needs to become key/main, otherwise the hosted
/// WKWebView never receives keyboard/pointer focus (which is why steering
/// otherwise required a click first). Default `NSWindow` returns false here.
final class KeyableWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

enum SaverMode {
    case screensaver // silent, cursor hidden, ANY input dismisses
    case game        // audible, cursor shown, input plays; ⌘Q/⌘W dismisses
}

/// Owns the per-display overlay windows and the input-driven dismissal.
final class SaverController {
    private var windows: [NSWindow] = []
    private var localMonitor: Any?
    private var globalMonitor: Any?
    private var shownAt = Date.distantPast
    private var activity: NSObjectProtocol? // defeats App Nap while rendering
    private(set) var isShowing = false

    var mode: SaverMode = .screensaver
    private var isGame: Bool { mode == .game }

    /// Called when the user dismisses — always returns to the menu bar (hide).
    var onDismiss: (() -> Void)?

    func show() {
        guard !isShowing else { return }
        guard let htmlURL = SaverWebView.htmlURL(in: .main) else {
            NSLog("[spacesaver] bundled spacesaver.html not found"); return
        }

        // The idle-watcher may sit in a low QoS band; raise it while visible so
        // WebGL renders smoothly. "…AllowingIdleSystemSleep" keeps App Nap off
        // without blocking system sleep.
        activity = ProcessInfo.processInfo.beginActivity(
            options: .userInitiatedAllowingIdleSystemSleep,
            reason: "SpaceSaver rendering")

        for screen in NSScreen.screens {
            let params = DisplayLayout.params(for: screen, isPreview: false)

            let host = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
            host.wantsLayer = true
            host.layer?.backgroundColor = NSColor.black.cgColor
            let webView = SaverWebView.make(frame: host.bounds, htmlURL: htmlURL,
                                            params: params, muted: mode == .screensaver)
            host.addSubview(webView)

            let win = KeyableWindow(contentRect: screen.frame, styleMask: [.borderless],
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
            // Game: the web view must be first responder so pointer/keys reach
            // the game immediately, without a click to focus it first.
            if isGame { win.makeFirstResponder(webView) }
            windows.append(win)
        }

        NSApp.activate(ignoringOtherApps: true)
        windows.first?.makeKey()
        if !isGame { NSCursor.hide() } // game: keep the cursor for steering
        shownAt = Date()
        installMonitors()
        isShowing = true
    }

    func hide() {
        guard isShowing else { return }
        removeMonitors()
        if !isGame { NSCursor.unhide() }
        for w in windows { w.orderOut(nil) }
        windows.removeAll() // drops the WKWebViews → stops rendering, frees GPU/CPU
        if let a = activity { ProcessInfo.processInfo.endActivity(a); activity = nil }
        isShowing = false
    }

    // Dismiss, but ignore the brief settle window right after showing (activation
    // itself can synthesise a mouse-moved event).
    private func dismiss() {
        guard isShowing, Date().timeIntervalSince(shownAt) > 0.6 else { return }
        onDismiss?()
    }

    private var dismissMask: NSEvent.EventTypeMask {
        [.mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown,
         .keyDown, .scrollWheel, .flagsChanged, .leftMouseDragged]
    }

    private func installMonitors() {
        if isGame {
            // Let input reach the web page (moving the mouse plays the game).
            // Only ⌘Q / ⌘W exit back to the menu bar — everything else passes
            // through so the WKWebView sees it.
            localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
                if event.modifierFlags.contains(.command),
                   let c = event.charactersIgnoringModifiers?.lowercased(), c == "q" || c == "w" {
                    self?.dismiss()
                    return nil
                }
                return event
            }
            return
        }
        // Screensaver mode: any input dismisses.
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

/// The menu-bar presence: idle-delay picker, "play now", quit, and the watcher.
final class MenuBarController: NSObject {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let saver = SaverController()
    private var timer: Timer?

    private let intervals = [1, 2, 3, 5, 7, 10, 15, 30] // minutes
    private let key = "idleMinutes"
    private var idleMinutes: Int {
        get { let v = UserDefaults.standard.integer(forKey: key); return v == 0 ? 5 : v }
        set { UserDefaults.standard.set(newValue, forKey: key); rebuildMenu() }
    }

    /// `--watch <secs>` headless override (no menu interaction needed).
    init(forcedIdleSeconds: Double? = nil) {
        super.init()
        if let btn = statusItem.button {
            btn.image = NSImage(systemSymbolName: "moon.stars.fill", accessibilityDescription: "SpaceSaver")
            btn.image?.isTemplate = true
        }
        if let secs = forcedIdleSeconds {
            UserDefaults.standard.set(max(1, Int(secs / 60)), forKey: key)
        }
        saver.onDismiss = { [weak self] in self?.saver.hide() }
        rebuildMenu()
        startWatching()
    }

    private func rebuildMenu() {
        let menu = NSMenu()

        let play = NSMenuItem(title: "Jetzt spielen", action: #selector(playNow), keyEquivalent: "")
        play.target = self
        play.toolTip = "Coin Rush über alle Displays — ⌘Q beendet das Spiel"
        menu.addItem(play)

        let preview = NSMenuItem(title: "Bildschirmschoner testen", action: #selector(showNow), keyEquivalent: "")
        preview.target = self
        menu.addItem(preview)

        menu.addItem(.separator())

        let header = NSMenuItem(title: "Aktiviert nach", action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for m in intervals {
            let it = NSMenuItem(title: "\(m) Minuten", action: #selector(pickInterval(_:)), keyEquivalent: "")
            it.target = self
            it.tag = m
            it.state = (m == idleMinutes) ? .on : .off
            sub.addItem(it)
        }
        header.submenu = sub
        menu.addItem(header)

        menu.addItem(.separator())

        let quit = NSMenuItem(title: "SpaceSaver beenden", action: #selector(quit), keyEquivalent: "")
        quit.target = self
        menu.addItem(quit)

        statusItem.menu = menu
    }

    @objc private func playNow() {
        guard !saver.isShowing else { return }
        saver.mode = .game
        saver.show()
    }

    @objc private func showNow() {
        guard !saver.isShowing else { return }
        saver.mode = .screensaver
        saver.show()
    }

    @objc private func pickInterval(_ sender: NSMenuItem) { idleMinutes = sender.tag }

    @objc private func quit() { NSApp.terminate(nil) }

    private func startWatching() {
        let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, !self.saver.isShowing else { return }
            if systemIdleSeconds() >= Double(self.idleMinutes * 60) {
                self.saver.mode = .screensaver
                self.saver.show()
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var menuBar: MenuBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        var forced: Double?
        if let i = args.firstIndex(of: "--watch") {
            forced = (i + 1 < args.count ? Double(args[i + 1]) : nil) ?? 300
        }
        menuBar = MenuBarController(forcedIdleSeconds: forced)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // menu-bar app: no Dock icon
app.run()
