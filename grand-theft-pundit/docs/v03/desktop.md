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
- **Splash** (`desktop/splash/`) until `GTP.game.booted` is true (30 s cap); the game window is
  created hidden with `backgroundThrottling: false` and shown after boot.
- **Window state** (`desktop/lib/window-state.js`): size, position, maximized, full screen in
  `window-state.json`, off-screen positions ignored.
- **Crash log** (`desktop/lib/crash-log.js`): `logs/crash.log` in the user-data folder (main
  exceptions, dead renderer/GPU processes, page uncaught errors and `console.error`, update
  failures); crashReporter with local minidumps only; *Help > Open Crash Log*. A dead game process
  now shows Restart / Open Crash Log / Quit instead of quitting.
- **Menus**: macOS app menu + Help menu; Windows/Linux a hidden menu bar (Alt) with Game and Help.
  Shortcuts handled in `before-input-event` only: F11 / Cmd-Ctrl+F full screen (as before),
  Cmd/Ctrl+Shift+M mods folder, Cmd+Option+I / Ctrl+Shift+I devtools. Menu accelerators are
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

Read-only, from the main process and the smoke test: `window.GTP.game.booted`, `GTP.game.state`
(`'title'`), `GTP.game.loading.active`, `GTP.errors`, `GTP.game.render()`, the `#gl` and `#hud`
canvases. If integration renames any of these, update `desktop/main.js` (`waitForBoot`) and
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

- The workflow changes have not run on GitHub yet (this session cannot dispatch workflows); the
  first push to `game/grand-theft-pundit` after integration is their first run. Windows and the
  DMG could not be built here (no Wine, no macOS); check the `windows` job output for
  `latest.yml` and `*-setup.exe.blockmap`, and the DMG window layout on a Mac.
- 0.2.0 players have no updater; they download 0.3.0 once by hand.
- Unsigned macOS builds cannot self-update (Squirrel.Mac requires a signature); they get the
  release-page notice. Adding the signing secrets switches them to in-place updates automatically.
- After an AppImage update is installed on quit, electron-updater runs the new AppImage once to
  finish; on a system without FUSE 2 that step fails (logged), but the file is already replaced.
- Pressing Alt alone on Windows/Linux toggles the menu bar, which shrinks the game view by the bar's
  height until Alt is pressed again. The game does not use Alt.
