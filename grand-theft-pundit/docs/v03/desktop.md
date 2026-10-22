# v0.3 track notes: desktop

Branch `v03/desktop`. Owns `grand-theft-pundit/desktop/**` and `.github/workflows/**`. No game file
was touched and no wrapper is installed on any `GTP.*` module. User and maintainer documentation is
in `desktop/README.md`; this file is for integration.

## What was built

- **Auto-update** (`desktop/lib/updater.js`, dependency `electron-updater` 6.8.9). Feed: this
  repository's GitHub Releases, from `"gtpUpdates"` in `desktop/package.json`. Checks 8 s after
  launch and every 4 h. *Install mode* (Windows installer, Linux AppImage, macOS signed with a
  Developer ID) downloads in the background and offers "Restart to Update" in an Electron dialog
  (first check) or a native notification (later checks); *Later* installs on quit. *Notify mode*
  (unsigned macOS, detected with `codesign`; Windows portable; non-AppImage Linux) fetches the
  platform's `latest*.yml` from `releases/latest/download` and offers "Open Release Page". Menu
  item *Check for Updates...* everywhere. Logs to `logs/update.log`.
- **Splash** (`desktop/splash/`): jokes while the scripts load, then the game's own loading
  progress (`GTP.game.loading.fraction`/`label`, pushed by main.js into `window.gtpSplash`). The game
  window is created hidden (`backgroundThrottling: false`; the chunk prebuild keeps running) and is
  shown once `booted && !loading.active && frames >= 1`, i.e. the title has drawn (60 s cap).
  Linux sets `GTK_THEME=Adwaita:dark` for GTK start-up only (removed from the environment at ready)
  so the window's pre-paint background is dark, not Adwaita's light grey.
- **Window state** (`desktop/lib/window-state.js`): size, position, maximized, full screen in
  `window-state.json`, off-screen positions ignored.
- **Crash log** (`desktop/lib/crash-log.js`): `logs/crash.log` in the user-data folder (main
  exceptions, dead renderer/GPU processes, page uncaught errors and `console.error`, update
  failures); crashReporter with local minidumps only; *Help > Open Crash Log*. A dead game process
  now shows Restart / Open Crash Log / Quit instead of quitting.
- **Menus**: macOS app menu + Help menu; Windows/Linux a hidden menu bar (Alt) with Game and Help.
  Shortcuts handled in `before-input-event` only: F11 (and Cmd+F on macOS) full screen,
  Cmd+Shift+M mods folder on macOS (Windows/Linux: Alt menu > Game), Cmd+Option+I / Ctrl+Shift+I
  devtools. Windows/Linux have no Ctrl+F or Ctrl+Shift+M since round 2: the game uses Ctrl to
  shoot, Shift to run, F for vehicles and M for the map. Menu accelerators are
  display-only (`registerAccelerator: false`) so no other key is taken from the game. About shows
  the version on every platform.
- **DMG background** `desktop/build/background.png` (+@2x) rendered by
  `build/make-dmg-background.js` from `build/dmg-background.html`.
- **Version** bumped to **0.3.0** in `desktop/package.json` (so a `[release]` at integration tags
  `v0.3.0`; the in-game title footer still says v0.2.0, which is in `js/`, not mine).
- **CI** (`.github/workflows/desktop-release.yml`): builds pass `--publish never` plus a github
  publish config (env `UPDATE_METADATA`) so electron-builder writes `latest*.yml` and blockmaps;
  they are uploaded and attached to the release, and the release job fails if one is missing.
  NSIS `differentialPackage` is now `true` (with `false` the installer got no blockmap or update
  info). New `smoke` job: downloads the Linux artifact, extracts the AppImage, runs
  `desktop/test/smoke.js` under xvfb; `release` needs it. npm cache via setup-node; Electron caches
  keyed on `package-lock.json`. `publish: null`, the mods folder, triggers and signing are unchanged.

## Interfaces consumed from the game

Read-only, from the main process and the smoke test: `window.GTP.game.booted`, `GTP.game.state`,
`GTP.game.loading` (`active`, `fraction`, `label`), `GTP.game.frames`, `GTP.errors`,
`GTP.game.render()`, the `#gl` and `#hud` canvases; the smoke test's new-game step also reads
`GTP.UI.state.title.items/sel`, `GTP.UI.state.dialogue/confirm/phone`, `GTP.Cutscenes.hud()` /
`.active` and `GTP.Missions.hud()` (`active`, `title`, `phase`, `objective`), and presses Enter
through CDP `Input.dispatchKeyEvent`. If integration renames any of these, update `desktop/main.js` (`waitForBoot`) and
`desktop/test/smoke.js`.

## Exposed

`window.GTP_MODS` (unchanged). Environment variables for tests: `GTP_USER_DATA_DIR`,
`GTP_UPDATES=off|notify|install`, `GTP_UPDATE_FEED_URL`.

## Test commands

```sh
cd grand-theft-pundit/desktop
npm ci && npm run dist:linux
./dist/*.AppImage --appimage-extract
xvfb-run -a -s "-screen 0 1280x800x24" node test/smoke.js squashfs-root/grand-theft-pundit
```

Verified locally (Linux container, through the proxy): `npm install`/`npm ci`; Linux AppImage build
with `latest-linux.yml`; smoke test passes on the unpacked app and on the extracted AppImage
(title screen screenshot checked) and fails, as it should, on a build with an injected page
exception; mac arm64 + x64 zips with blockmaps and `latest-mac.yml` built on Linux; an AppImage
0.3.0 replaced itself with 0.3.1 from a local feed on quit; notify mode found 0.3.1 on a local feed
and showed the dialog, and against GitHub correctly reported no update (v0.2.0 has no metadata);
workflow parsed with PyYAML and passes actionlint.

## Known issues

- The workflow ran green on GitHub at integration (run 39476942116, see below). The DMG window
  layout itself has still not been looked at on a Mac; the new CI step checks the files are there.
- 0.2.0 players have no updater; they download 0.3.0 once by hand.
- Unsigned macOS builds cannot self-update (Squirrel.Mac requires a signature); they get the
  release-page notice. Adding the signing secrets switches them to in-place updates automatically.
- After an AppImage update is installed on quit, electron-updater runs the new AppImage once to
  finish; on a system without FUSE 2 that step fails (logged), but the file is already replaced.
- Pressing Alt alone on Windows/Linux toggles the menu bar, which shrinks the game view by the bar's
  height until Alt is pressed again. The game does not use Alt.

## Integration round 1 (game/grand-theft-pundit at 65dc2b7, merged into v03/desktop)

**CI run 39476942116** (on 3ad04d0, the push with the desktop merge; every job green, release
skipped as intended), read from the job logs:
- Windows: `Grand-Theft-Pundit-0.3.0-win-x64-setup.exe`, `...-portable.exe`,
  `...-setup.exe.blockmap` and `latest.yml` (lists the setup exe; the portable exe is not an update
  target, by design). No warnings beyond "signing skipped".
- macOS: both DMGs, both zips, both zip blockmaps, `latest-mac.yml` listing both zips. The build log
  does not say which DMG background was used, so the workflow now mounts each DMG and fails without
  `.background/*` and `.DS_Store` (new step "Check the DMG window artwork"; first runs on the next push).
- Smoke: all 16 checks passed in 27 s.

**Merged v0.3 game in the packaged app** (local, `npm run pack`, xvfb, software GL): boots to the
title in about 12 s (scripts ~6 s, loading ~1 s, first title frame ~4 s in SwiftShader); Enter on
NEW GAME -> loading screen (11-15 s) -> opening cutscene "Table Stakes" (skipped with held Enter)
-> first objective "Get to Dorm 4B" (m00_intro) in 41-53 s; no page errors, `GTP.errors` empty,
crash log clean. The smoke test now does all of this on every build (step 8).

**Splash handover.** Before: the window appeared at `booted`, while the game's own loading screen
was at 89 %, so players saw two loading UIs in a row. Now the splash carries the game's progress and
stays until the title has drawn. X-level screenshots every 0.25 s across the boot then showed a
~2 s light-grey (Adwaita, mean 245/255) full-window frame at the reveal: X shows the GTK theme
background until Chromium paints, and the renderer was busy in the first title frame. With
`GTK_THEME=Adwaita:dark` the brightest frame across the whole boot is the title itself (mean 53).
That pre-paint gap still exists but is dark; it lasts one frame on a real GPU (about 2 s with
SwiftShader). macOS and Windows use `backgroundColor` natively and never showed it.

**Known since round 1**
- GitHub warns that `actions/*@v4` run on Node 24 instead of the deprecated Node 20; harmless now,
  bump to the next major of each action when convenient.
- The title footer still says `v0.2.0` (in `js/`, not desktop-owned); the app is 0.3.0.

## Round 2 (final, merged with game/grand-theft-pundit at 10ba585)

Summary and verification: `docs/v03/final_desktop.md`. In short:
- **QA-C findings fixed:**
  - QAC-05: fuses, plus `test/check-fuses.js`.
  - QAC-06: read-only token, write only in the release job, no persisted credentials.
  - QAC-29: navigation lock, mods only on the game page.
  - QAC-30: tag via env, validated.
  - QAC-43: mod syntax errors reported; the DevTools shortcut already existed since round 0.
- **Not done:** SHA-pinning of the actions; QAC-31 (CSP in `index.html`, not desktop-owned).
- **Audit:** six review dimensions, each finding traced by a second pass; all confirmed findings
  fixed:
  - Updater: install mode only where it can apply, dialogs only at title/pause, silent NSIS
    restart, a fallback `app-update.yml`, notifications retained, the menu check always answers.
  - Crash-log throttling.
  - Shortcut conflicts with game keys.
  - Window lifecycle: second launch during the splash, crash-restart during boot, OOM `killed`,
    window state on `closed`, maximized while minimized.
  - CI: concurrency for publishing runs, tag/version check, DMG art location, job time limits.
  - Smoke-test robustness: CDP timeouts and watchdog, a drop check with proof, a screen-size-safe
    window test.
  - check-fuses parsing.
- **New interfaces consumed (read-only):** `GTP.game.state` (`'title'`/`'paused'`) for update
  dialog timing.
- **CI on `v03/desktop`:** the push trigger includes this branch; it builds and tests every
  platform but never publishes (the `[release]` condition requires `refs/heads/game/grand-theft-pundit`).
  Integration may keep or drop that trigger line.
