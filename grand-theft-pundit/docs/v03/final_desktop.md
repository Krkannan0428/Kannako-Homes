# v0.3 desktop: final report

Track `desktop`, branch `v03/desktop` (owns `grand-theft-pundit/desktop/**` and `.github/workflows/**`).
Merged with `origin/game/grand-theft-pundit` at 10ba585 (the latest at the time of writing). Version
in `desktop/package.json`: **0.3.0**. Nothing in `js/`, `index.html` or another track's files was
touched. Detailed notes: `docs/v03/desktop.md`; user and maintainer docs: `desktop/README.md`.

## What ships in 0.3.0

| Platform | Files the release job attaches |
| --- | --- |
| macOS Apple Silicon | `Grand-Theft-Pundit-0.3.0-mac-arm64.dmg`, `...-mac-arm64.zip`, `...-mac-arm64.zip.blockmap` |
| macOS Intel | `Grand-Theft-Pundit-0.3.0-mac-x64.dmg`, `...-mac-x64.zip`, `...-mac-x64.zip.blockmap` |
| Windows x64 | `Grand-Theft-Pundit-0.3.0-win-x64-setup.exe` (+ `.blockmap`), `...-win-x64-portable.exe` |
| Linux x64 | `Grand-Theft-Pundit-0.3.0-linux-x86_64.AppImage` |
| update metadata | `latest-mac.yml`, `latest.yml`, `latest-linux.yml` |

The release job fails if any of the three `latest*.yml` is missing. It publishes only on a `v*` tag
that matches `package.json`, a manual run with `release_tag`, or a `[release]` commit pushed to
`game/grand-theft-pundit` (pushes to `v03/desktop` build and test but never publish).

## Built in the final round

- **Hardening (QA-C findings in desktop files, all fixed):**
  - QAC-05: Electron fuses are set (no RunAsNode, NODE_OPTIONS or `--inspect`; asar integrity and
    asar-only loading). `grantFileProtocolExtraPrivileges` stays on because turning it off stops
    `index.html` loading from `app.asar` at all (tested). Cookie encryption stays off. Unsigned
    arm64 Macs are re-signed ad hoc after the flip. `test/check-fuses.js` reads the fuses back;
    every CI build job runs it.
  - QAC-29: the window only ever shows `app/index.html`; a script navigation or a dropped file
    cannot replace the game, and mods are injected only into the game page.
  - QAC-43: mod syntax errors are caught (`vm.Script` compile, no execution) and reported in
    `GTP_MODS.errors`, the console and the crash log with their line number.
  - QAC-06: the workflow token is read-only except in the release job; checkouts do not persist it.
  - QAC-30: the release tag goes through the environment and is validated.
  - Not done: pinning the actions to commit SHAs (QAC-06 "ideally"). Looking up the SHAs means
    reading other repositories, which this session was told not to attach. QAC-31 (CSP) is in
    `index.html`, which another track owns.
- **Auto-update**, from an audit checked against electron-updater 6.8.9's source:
  - Install mode is used only where the update can really be applied: a genuine AppImage, the
    NSIS-installed game, or a signed Mac app not running from the DMG. Everything else gets the
    "Version X is available / Open Release Page" notice.
  - "Restart to Update" installs silently and relaunches the game (before, it showed the NSIS
    wizard).
  - Unprompted update dialogs appear only on the title screen or when paused. During play there
    is a notification, and the dialog waits for the next pause (Enter would otherwise press its
    default button).
  - Builds made without a publish config can update.
  - "Check for Updates..." always answers.
- **Shell fixes:**
  - Windows/Linux no longer take Ctrl+F and Ctrl+Shift+M. Those happen in play: Ctrl shoots,
    Shift runs, F is vehicles, M is the map. F11 and the Alt menu are used instead.
  - A second launch during the splash no longer shows the half-built window.
  - "Restart" after a crash during boot shows the window.
  - A renderer killed by the Linux out-of-memory killer now gets the crash dialog.
  - Window state is saved even when the window closes without a `close` event.
  - Quitting during the splash no longer forgets maximized or full screen, and a window minimized
    while maximized comes back maximized.
- **Crash log:** rolls over while the game runs, folds repeated page errors into one line, and
  caps page lines per session.
- **CI:**
  - Every build job launches what it built: the macOS job verifies the code signatures and boots
    the arm64 app, and the Windows job boots its app (both stop at the title). The Linux AppImage
    goes through the title and into a new game up to the first objective.
  - The DMG check finds the background art (`.background.tiff`).
  - A later push can no longer cancel a publishing run. Publishing is serialised.
  - A pushed tag must match `package.json`.
- **README:** a plain-language "Download and install" section for friends:
  - which file to pick;
  - Mac first launch: right-click > Open, *Open Anyway* on Sequoia, and `xattr -cr` for
    "damaged";
  - Windows SmartScreen: *More info > Run anyway*;
  - Linux FUSE;
  - updates, where saves and mods live, the crash log, and uninstalling.

## Verified

Local, in a Linux container, on the merged game:
- `npm ci` works through the proxy.
- `npm run pack` and the AppImage build work, and the fuses are correct.
- The smoke test passes all 24 checks on the packaged app:
  - splash, title, New Game, the opening cutscene "Table Stakes", the first objective
    "Get to Dorm 4B";
  - no console errors and a clean crash log;
  - the mods loader, the navigation lock (script and file drop), a broken mod, and window state.
- Negative runs: the same test fails on the previous build (navigation), and on a build with an
  injected page error.
- Updates, end to end:
  - A 0.3.0 AppImage built without a publish config ran as a real AppImage
    (`--appimage-extract-and-run`). It picked install mode, found 0.3.1 on a local feed,
    downloaded it during the splash, and showed the "ready to install" dialog once the title was
    up. On quit it replaced itself with the 0.3.1 file.
  - Notify mode found 0.3.1 on the local feed, and found nothing on GitHub (v0.2.0 has no
    metadata).
- Mac arm64 + x64 zips were built on Linux: fuses correct on both, `latest-mac.yml` and blockmaps
  present, the asar integrity hash in `Info.plist`.
- Saves made by the build without fuses are read by the fused build (same `file://` storage).
- The workflow passes actionlint and parses as YAML.

On GitHub (pushes to `v03/desktop`):
- Run 39845693012, on c3e5287:
  - Linux build + fuses: pass.
  - Linux smoke with New Game: pass.
  - Windows: the build, fuses and the boot to the title passed, as did mods, the navigation lock
    and no errors. Only the window-state checks failed (a 1024-pixel screen, and the save on
    `window.close()`); both are fixed in 5f6da67.
  - macOS: built both DMGs and zips, but the DMG art check was looking in the wrong place (the
    art is there as `.background.tiff`), so the later Mac steps were skipped; fixed in 5f6da67.
- The CI results for the later pushes are under "CI on the final commits" below.

## CI on the final commits

- **Run 39847748149** (5f6da67, all app and test code final):
  - **Windows: green.** The build, `latest.yml` and the installer blockmap, the fuse check, and
    the launch test on the packaged app all passed. The launch test covered the title, mods, the
    navigation lock with the drop reaching the page, no errors, the saved window size, the
    broken-mod report and the save on quit.
  - **Linux build + fuses: green.**
  - **Linux smoke (AppImage, title through New Game to the first objective): green.**
  - **macOS:** built both DMGs and zips with `latest-mac.yml`, then failed only at the DMG art
    check. Under `pipefail` an `ls | grep` pipeline failed although `.background.tiff` was there.
    2022a33 replaces it with `[ -f ]` tests, which pass and fail correctly on fake DMG folders
    under `bash -eo pipefail`; actionlint is clean.
- **Run 39849433387** (2022a33):
  - **Windows, Linux and Linux smoke: green again.**
  - **macOS:**
    - **Passed:** the DMG art check, then fuses and code signatures on both apps (the ad-hoc
      re-sign after the fuse flip is valid).
    - **Launch test, passed:** the unsigned arm64 app started with the fuses on. The game booted
      to the title, the splash handed over, mods loaded and the navigation lock held.
    - **Launch test, failed:** the runner VM could not create any WebGL context
      (`VENDOR = 0xffff`, GPU process sandboxed). The game came up without a renderer and its
      frame loop threw every frame. That means the picture checks and the error checks failed.
      This is the CI machine; real Macs have WebGL.
- **45fbdff** answers that:
  - The smoke test passes `--disable-gpu-sandbox` on macOS, so software GL has a chance to start.
  - The mac step passes `--webgl-optional`. If WebGL is still missing, only the picture checks
    and the errors caused by the missing context are skipped, with a note.
  - Linux and Windows keep the strict checks; Linux was re-run locally in strict mode and passed.
  - Result: see "macOS result" below.

### macOS result

(filled in below once the run for 45fbdff finishes)

## Known issues

- No one has looked at the DMG window or the app on a real Mac. CI mounts each DMG, checks the art
  and the layout file, verifies the code signature and boots the arm64 app on a macOS runner.
- Unsigned macOS builds cannot update themselves (Squirrel.Mac requires a signature); they get the
  release-page notice. Adding the existing signing secrets switches them to in-place updates.
- 0.2.0 players have no updater; they download 0.3.0 once by hand.
- After an AppImage update the new file has the new version in its name, so a desktop shortcut that
  points at the old file name needs updating (electron-updater behaviour).
- The in-game title footer says v0.2.0 (in `js/`, not desktop-owned).
- GitHub warns that the `actions/*@v4` actions run on Node 24 instead of the deprecated Node 20.
  This is harmless; bump them when convenient.
