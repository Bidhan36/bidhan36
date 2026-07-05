# Daphe Sky 🐦🏔️

A Flappy-style game starring **Daphe**, the Himalayan Monal — Nepal's national
bird — flying over the snow-capped Himalayas and the pagoda rooftops of
Kathmandu. Tap (or press Space) to flap, thread the prayer-flag pillars, and
chase a new high score.

Everything is hand-drawn in Canvas (gradients, layered parallax, procedural
animation) and every sound effect is synthesized with the Web Audio API —
there are no external image or audio assets, so nothing can fail to load and
the whole game is a few small text files.

## Play it

Open `index.html` in any modern browser (desktop or mobile). On iPad/iOS/
Android, add it to the home screen for a full-screen, app-like experience
(it's a installable PWA via `manifest.webmanifest`).

Controls: tap / click anywhere, `Space`, or `ArrowUp` to flap.

## Run locally

From the repository root:

```bash
npm start
# serves ./game at http://localhost:8080
```

Or just open `game/index.html` directly in a browser.

## Build native iOS / Android apps (Capacitor)

The repo root has a `capacitor.config.json` pointing `webDir` at `game/`.
From the repository root:

```bash
npm install
npx cap add ios       # generates the ios/ Xcode project
npx cap add android   # generates the android/ Gradle project
npx cap sync          # copies game/ into both native projects

npx cap open ios      # opens Xcode — build & run on iPad/iPhone
npx cap open android  # opens Android Studio — build & run on device/emulator
```

Xcode (macOS) is required to build/sign the iOS app; Android Studio (or the
Android SDK/Gradle) is required for the Android build.

## Project structure

```
game/
  index.html            game shell + UI overlays
  style.css             layout, HUD, responsive/safe-area styling
  game.js               game loop, physics, rendering, audio, input
  manifest.webmanifest  PWA metadata (installable home-screen app)
  icons/                app icons (SVG source + generated PNGs)
```

## Notes on the build

- Physics, collisions and scoring are frame-rate independent (delta-time
  based) and clamp large `dt` spikes (e.g. after a backgrounded tab) so the
  bird never tunnels through obstacles.
- Canvas is sized to the device pixel ratio (capped at 2.5x) and re-lays out
  scenery on resize/orientation change, so it's sharp on Retina/iPad displays
  and correct in both portrait and landscape.
- Difficulty (gap size, pipe speed/interval) ramps gently with score and is
  capped, so the game stays fair rather than becoming unplayable.
- High score and mute preference persist via `localStorage`.
