# SpaceSaver — macOS

Native macOS packaging of the web space-screensaver, rendered across **all
displays as one continuous world**. The virtual canvas is the bounding box of
every `NSScreen`; each display renders its slice via the web page's
`?view=x,y,W,H` frustum split, and one display drives the simulation while the
rest follow over `?sync=master|follow` (`BroadcastChannel`). All of this is
derived generically from the live display arrangement — nothing is hard-coded.

There are **two targets** in `SpaceSaver.xcodeproj`:

| Target | Product | Status |
| --- | --- | --- |
| **`SpaceSaverApp`** | `SpaceSaver.app` | ✅ **Use this.** Works fully — seamless, synced, WebGL across all displays. |
| `SpaceSaver` | `SpaceSaver.saver` | ⚠️ Experimental. Renders **black** inside the modern screensaver sandbox — see below. |

## Installation (quick start)

`SpaceSaver.app` runs in the **menu bar**: pick the idle delay before the
screensaver kicks in, drop into the game, or quit. Run from the repo root:

```sh
# 1. Build the app (needs Xcode + Node)
xcodebuild -project macos/SpaceSaver.xcodeproj -scheme SpaceSaverApp \
  -configuration Release -derivedDataPath macos/build

# 2. Install it
cp -R macos/build/Build/Products/Release/SpaceSaver.app /Applications/

# 3. Launch it at login (LaunchAgent) so it's always in the menu bar
cp macos/net.geraldhofbauer.spacesaver.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/net.geraldhofbauer.spacesaver.plist
```

From the menu-bar icon (a moon) you can:

- **Aktiviert nach** → pick the idle delay: **1, 2, 3, 5, 7, 10, 15, 30 min**
  (persists in `UserDefaults`; default 5).
- **Jetzt spielen** → multi-display Coin Rush right now, with sound. Steer with
  the mouse; **⌘Q** (or ⌘W) exits back to the menu bar.
- **Bildschirmschoner testen** → show the screensaver immediately.
- **SpaceSaver beenden** → quit.

The screensaver shows after the chosen idle time across every display and hides
on any input. Uninstall the login item with:

```sh
launchctl bootout gui/$(id -u)/net.geraldhofbauer.spacesaver
```

**Heads-up — avoid overlap with the macOS screensaver.** The app is *not* the
system screensaver, so macOS's own screensaver (System Settings → Screen Saver)
will still trigger at its own idle time and draw on top. Either set SpaceSaver's
delay shorter than the system one, or set the macOS screensaver to **Never** so
SpaceSaver is the only one. And don't select the experimental `SpaceSaver.saver`
there — it renders black (see below).

`--watch <secs>` is still accepted as a headless override for scripting (seeds
the idle delay); normal use is the menu.

## Why the standalone app (and not just a `.saver`)

A `.saver` bundle is the "native" way to ship a screensaver, and it's built
here too. But on macOS 14+ (verified on **26.5**) the `legacyScreenSaver`
sandbox that hosts third-party savers has two blockers for a WebGL/WKWebView
saver, **both confirmed on real hardware**:

1. **WebGL renders black.** The page loads and the DOM/HUD draws, but the
   Three.js `<canvas>` stays black — the sandbox denies the WebKit GPU path.
   The *identical* code renders perfectly outside the sandbox.
2. **One process per display.** macOS spawns a separate `legacyScreenSaver`
   process for each screen, so a shared `WKProcessPool` / `BroadcastChannel`
   can't sync the displays — the seams would drift even if (1) were fixed.

`SpaceSaver.app` sidesteps both: it's a normal app, so **one process** owns a
borderless full-screen window on every display. WebGL renders, and because all
the web views share one process they sync over `BroadcastChannel` out of the
box — exactly the seamless, in-lockstep result the task calls for. The `.saver`
target is kept for the System-Settings integration and in case Apple relaxes
the sandbox; if you select it and see black, that's the sandbox, not a bug.

## Build

Requires Xcode 16+ and Node (for the web build). The build's *"Bundle standalone
web build"* phase runs `npm run build:standalone` in the repo root and copies
`dist/spacesaver.html` into the app bundle, so the web side is always the single
source of truth — no committed 600 kB artifact.

```sh
# from macos/
xcodebuild -project SpaceSaver.xcodeproj -scheme SpaceSaverApp -configuration Release -derivedDataPath build
# product: build/Build/Products/Release/SpaceSaver.app  (or DerivedData if you build in Xcode)
```

Or open `SpaceSaver.xcodeproj` in Xcode and build the **SpaceSaverApp** scheme.

## Modes

The app lives in the menu bar (see [Installation](#installation-quick-start)):

- **Screensaver** — shows after the chosen idle delay across every display,
  silent, hides on any input.
- **Game (Jetzt spielen)** — multi-display Coin Rush with sound. Coins/asteroids
  sync from the primary "master" display and you can steer from any screen;
  input flows to the game, **⌘Q** exits back to the menu bar.

`--watch <secs>` is accepted as a headless override (seeds the idle delay) for
scripting; normal use is the menu.

## Signing

The project is set to **ad-hoc** signing (`CODE_SIGN_IDENTITY = "-"`), so it
builds and runs locally with no Developer account. For an unsigned/ad-hoc build,
the first launch may need right-click → **Open** (or **System Settings →
Privacy & Security → Open Anyway**). To distribute, set your Team/identity in
the target's signing settings and notarize as usual — same flow as the other
`net.geraldhofbauer.*` apps.

## The `.saver` (optional)

```sh
xcodebuild -project SpaceSaver.xcodeproj -scheme SpaceSaver -configuration Release -derivedDataPath build
cp -R build/Build/Products/Release/SpaceSaver.saver ~/Library/Screen\ Savers/
```

Then pick it in **System Settings → Screen Saver**. Expect a black canvas with
only the HUD until the sandbox limitations above are lifted.

## Layout / notes

- `DisplayLayout.swift` — turns the `NSScreen` arrangement into each display's
  `?view` offset (with the y-flip: `NSScreen` is y-up, the web canvas y-down)
  and picks the primary display as sync `master`.
- `SaverWebView.swift` — the shared `WKWebView` factory (load path, mute,
  `localStorage` fallback). Used by both targets.
- Audio is forced muted, and Web Audio needs a user gesture the screensaver
  never gets — so it's silent by design. No network is used (the standalone
  build is fully inlined).
- Only the idle mode is relevant in a screensaver context (Coin Rush / Explore
  need pointer input, which dismisses it).
