# Grand Theft Pundit: desktop builds

This folder turns the browser game one level up (`index.html`, `js/`, `vendor/`) into a
downloadable desktop game with [Electron](https://www.electronjs.org/) and
[electron-builder](https://www.electron.build/). Nothing in the game changes: `sync-game.js`
copies the three game paths into `desktop/app/`, `main.js` opens that `index.html` in a window,
and electron-builder wraps the result into installers. Around the game the desktop shell adds a
boot splash, remembered window size and full screen, automatic updates from GitHub Releases, a
crash log, a mods folder and native menus.

Targets:

| Platform | Output in `dist/` | Notes |
| --- | --- | --- |
| macOS, Apple Silicon (M1 and later) | `Grand-Theft-Pundit-0.3.0-mac-arm64.dmg` and `.zip` | drag to Applications |
| macOS, Intel | `Grand-Theft-Pundit-0.3.0-mac-x64.dmg` and `.zip` | |
| Windows 10/11, x64 | `Grand-Theft-Pundit-0.3.0-win-x64-setup.exe` (installer), `...-win-x64-portable.exe` (no install) | |
| Linux, x64 | `Grand-Theft-Pundit-0.3.0-linux-x86_64.AppImage` | `chmod +x`, then run |

The version in every file name comes from `package.json`; bump it there before tagging a release.
Each build also writes the auto-update metadata next to these files: `latest-mac.yml`,
`latest.yml` (Windows installer), `latest-linux.yml` and `*.blockmap` (see "Updates" below).

## Build locally on a Mac

Requirements: macOS 11 or newer, [Node.js](https://nodejs.org/) 22.12 or newer (Electron 44
requires it; 22 is what the release workflow uses), and a normal internet connection the first time
(electron-builder downloads the Electron binaries for each platform into
`~/Library/Caches/electron`). Electron 44 fetches its own binary for `npm start` on first use rather
than during `npm install`; `npx install-electron --no` does it ahead of time. Behind a proxy, npm and
both downloads honour `HTTPS_PROXY` (and `NODE_EXTRA_CA_CERTS` for a custom CA).

```sh
cd grand-theft-pundit/desktop
npm install          # electron + electron-builder, pinned in package-lock.json
npm start            # run the game in a dev window (syncs the game files first)
npm run dist:mac     # arm64 + x64 .dmg and .zip into desktop/dist/
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run sync` | copy `../index.html`, `../js`, `../vendor` into `app/` (runs automatically before every other script and as electron-builder's `beforePack` hook) |
| `npm run pack` | unpacked app for the current platform in `dist/<platform>-unpacked/`, no installer; the quickest way to test the packaged app |
| `npm run dist` | everything electron-builder can build on this machine (dmg/zip on macOS, nsis/portable on Windows, AppImage on Linux) |
| `npm run dist:win` | Windows installer + portable exe (run on Windows; works on macOS/Linux too if [Wine](https://www.electron.build/multi-platform-build) is installed) |
| `npm run dist:linux` | Linux AppImage (run on Linux, or on macOS with Docker as electron-builder documents) |
| `npm run icon` | re-render `build/icon.png` and `build/icon-full.png` from `build/icon.html` (needs Playwright, see below) |
| `npm run dmg-background` | re-render `build/background.png` and `background@2x.png` from `build/dmg-background.html` (needs Playwright) |
| `npm run smoke -- <app executable>` | launch a packaged app and check the title screen renders with no errors (see "Smoke test") |

In the game:

| Keys | What |
| --- | --- |
| **F11**, **Cmd+F** (macOS), **Ctrl+F** (Windows/Linux) | toggle full screen (**Ctrl+Cmd+F** too on macOS) |
| **Cmd+Shift+M** / **Ctrl+Shift+M** | open the mods folder |
| **Cmd+Option+I** / **Ctrl+Shift+I** | developer tools (console for mod authors) |
| **Alt** (Windows/Linux) | show the hidden menu bar: *Game* (full screen, mods folder, quit) and *Help* (check for updates, release notes, mods folder, crash log, developer tools, About) |

**Esc** is left to the game, and the shortcuts above are the only keys the shell takes. On macOS
the same items are in the app menu and the *Help* menu. Starting the game a second time focuses
the running window instead of opening another one.

What the desktop shell does around the game:

- **Splash.** A small window with the logo shows while the game's scripts load, then takes over the
  game's own loading screen: its bar and caption follow `GTP.game.loading` (fraction and stage
  label). The game window appears only once that loading is done and the title has drawn its first
  frame, so there is one loading UI and the player never sees a half-built loading screen (60 s
  cap). On Linux the app starts GTK with `Adwaita:dark` (unless you set `GTK_THEME` yourself) so the
  moment between showing the window and its first paint is dark rather than a white flash; programs
  the game launches keep your own theme.
- **Window memory.** Size, position, maximized and full screen state are saved to
  `window-state.json` in the data folder and restored next time. A position on a monitor that is no
  longer connected is ignored, so the window never opens off-screen.
- **About.** *About Grand Theft Pundit* (app menu on macOS, *Help* on Windows/Linux) shows the
  version, the Electron and Chromium versions, the update mode and the data folder.
- **Crash log.** `logs/crash.log` in the data folder collects main-process exceptions, a game or
  GPU process that died, uncaught errors and `console.error` lines from the game, and failed update
  checks, with one `[start]` line per launch (version, OS). *Help > Open Crash Log* opens it; attach
  it to a bug report. It rolls over to `crash.old.log` at 1 MB. Native minidumps (never uploaded) go
  to `Crashpad/`, and everything the updater does goes to `logs/update.log`. If the game process
  dies, a dialog offers to restart it or open the log.

The data folder (mods, logs, window state; your saves live in the game's own storage there too):

| Platform | Folder |
| --- | --- |
| macOS | `~/Library/Application Support/Grand Theft Pundit` |
| Windows | `%APPDATA%\Grand Theft Pundit` |
| Linux | `~/.config/Grand Theft Pundit` |

## Updates

From 0.3.0 on, the game checks this repository's GitHub Releases (public, no token) a few seconds
after it starts and every four hours while it runs. How it updates depends on the build:

| Build | What happens |
| --- | --- |
| Windows installer (`...-setup.exe`) | downloads the update in the background (progress on the taskbar button), then asks **Restart to Update** or **Later**; *Later* installs it silently the next time you quit |
| Linux AppImage | the same; the AppImage file is replaced in place on restart or quit |
| macOS, signed with a Developer ID | the same, through Squirrel.Mac (download the `.zip`, swap the app on restart or quit) |
| macOS, unsigned (the default here) | macOS will not let an unsigned app replace itself, so the game says **Version X is available** and **Open Release Page** takes you to the download; replace the app in Applications by hand (saves and mods are kept) |
| Windows portable exe, extracted AppImage, unpacked folders | like unsigned macOS: a message with a link to the release page |
| `npm start` (development) | no checks |

The first check after launch asks with a dialog (you are on the title screen); later checks while
you play use a system notification you can click, so no dialog interrupts a mission. *Check for
Updates...* in the menu always answers, also with "You have the latest version". Update failures
never stop the game; they are written to `logs/update.log` and the crash log. An unsigned macOS
build decides it is unsigned by asking `codesign` for a *Developer ID Application* authority, so
the same build switches to in-place updates by itself once releases are signed.

**For maintainers.** Nothing extra is needed to ship an update: bump `version` in `package.json`
and release as below. The release workflow builds with a GitHub publish config and
`--publish never`, so electron-builder writes `latest.yml`, `latest-mac.yml`, `latest-linux.yml`
and the `*.blockmap` files (for differential downloads) without uploading anything itself; the
release job attaches them with the installers and fails if any platform's metadata is missing.
The game finds the feed from `"gtpUpdates": {"owner", "repo"}` in `package.json`; change that if
the repository moves. `electron-builder.yml` keeps `publish: null` so a local build never tries to
publish. Points to keep in mind:

- Only the newest non-prerelease release counts (GitHub's "latest"). A release whose tag has a
  `-` (for example `v0.4.0-beta.1`) is published as a prerelease and is not offered.
- Do not rename the artifacts or delete the `.yml`/`.blockmap` files from a release; installed
  games look them up by name.
- Releases before 0.3.0 have no metadata and the 0.2 app has no updater, so 0.2 players download
  0.3 once by hand; from then on updates arrive by themselves.
- To test an update locally, build two versions and serve the newer `dist/` as a generic feed:

  ```sh
  npx electron-builder --linux AppImage -c.extraMetadata.version=0.3.1 -c.directories.output=/tmp/feed \
    --publish never -c.publish.provider=generic -c.publish.url=http://127.0.0.1:8765
  (cd /tmp/feed && python3 -m http.server 8765) &
  GTP_UPDATE_FEED_URL=http://127.0.0.1:8765 ./dist/Grand-Theft-Pundit-0.3.0-linux-x86_64.AppImage
  ```

  `GTP_UPDATES=notify` or `GTP_UPDATES=install` forces a mode, `GTP_UPDATES=off` turns checks off.

## Opening an unsigned build

Unless a build was made with a signing certificate (see "Signing" below), macOS and Windows warn
that the developer is unknown. The game is still fine to run; this is how to get past the notice.
These are Apple's documented steps for apps from unidentified developers
(Apple's guide: <https://support.apple.com/guide/mac-help/mh40616/mac>).

**macOS 14 Sonoma and earlier.** Do this once for the app:

1. Open the `.dmg` and drag *Grand Theft Pundit* into *Applications* (or unzip the `.zip`).
2. In the Finder, **Control-click (right-click) the app and choose Open** from the menu.
3. In the dialog that says the developer cannot be verified, click **Open**.

After that it opens with a normal double-click.

**macOS 15 Sequoia and later.** Apple removed the Control-click shortcut for unsigned apps, so:

1. Double-click the app. A message says Apple could not verify it is free of malware. Click **Done**.
2. Open **System Settings > Privacy & Security**, scroll down to the *Security* section, and click
   **Open Anyway** next to the message about Grand Theft Pundit.
3. Confirm with **Open Anyway** again (and your password or Touch ID if asked).

If macOS instead says the app "is damaged and can't be opened", the download's signature could not
be checked. The proper fix is a signed and notarized build: add the Apple signing secrets described
below and re-run the release workflow. Until then, use the Control-click > Open flow above on the
`.zip` build from the release page, which macOS treats more leniently than the `.dmg`.

Both Apple Silicon and Intel builds are plain Electron apps; the arm64 one is the native one for
M-series Macs and the x64 one also runs there through Rosetta, only slower.

**Windows.** SmartScreen shows "Windows protected your PC" for unsigned installers: click
**More info**, then **Run anyway**. The portable `.exe` runs without installing anything.

**Linux.** `chmod +x Grand-Theft-Pundit-*.AppImage && ./Grand-Theft-Pundit-*.AppImage`. If your
distribution has no FUSE 2 (the AppImage prints "AppImages require FUSE to run"), unpack it once
with `./Grand-Theft-Pundit-*.AppImage --appimage-extract` and start `squashfs-root/AppRun` instead;
as root, add `--no-sandbox`.

## Releases from GitHub Actions

`.github/workflows/desktop-release.yml` builds all three platforms on every push to the
`game/grand-theft-pundit` branch that touches the game or this folder, then the `smoke` job runs
the packaged Linux app under xvfb (see "Smoke test"); a release is only published when it passes. The builds appear as
artifacts on the run's page in the Actions tab. To publish a GitHub Release with download links,
either put `[release]` in the commit message (the release is tagged `v` plus the `version` in
`desktop/package.json`, so bump that first), or push a tag starting with `v`:

```sh
# bump "version" in desktop/package.json first so the file names match
git commit -m "Ship 0.2.0 [release]"     # or:
git tag v0.2.0 && git push origin v0.2.0
```

The macOS job runs on `macos-14` and produces the arm64 and x64 dmg/zip (and mounts each DMG to
check the background art and Finder layout are in it), the Windows job the installer and portable
exe, and the Linux job the AppImage, each with its update metadata. The last job creates (or updates, if it
exists) the release for that tag with every file attached and auto-generated notes. "Run workflow"
from the Actions tab builds the same files as workflow artifacts without a tag; fill in
`release_tag` with an existing tag to publish a release from a manual run.

`npm ci` is used when `package-lock.json` is committed (it is), so CI builds use exactly the
versions tested here; without a lockfile the workflow falls back to `npm install`. The npm download
cache (through `setup-node`) and the Electron/electron-builder binary caches are keyed on
`package-lock.json`, so they only miss when a dependency changes.

## Smoke test

`test/smoke.js` launches a packaged app with `--remote-debugging-port`, talks to it over the Chrome
DevTools Protocol with Node 22's built-in `fetch` and `WebSocket` (no dependencies) and fails unless:
the game page loads and boots, reaches the title screen with the loading screen finished, the
splash has closed and the window is visible, the 3D canvas and the HUD show a real picture, and a
test mod in the mods folder ran. Then it plays into a new game with real key presses: Enter on
NEW GAME, the loading screen, the opening cutscene (held Enter skips it, as its pill says),
dialogue, until the first mission objective is on the HUD. Throughout, there must be no page
exceptions, console errors or `GTP.errors`, and the crash log must hold nothing but its start line
(`--no-new-game` stops after the title). It then restarts the app with a saved window size and
checks both the restore and the save on quit. It uses a throw-away data folder
(`GTP_USER_DATA_DIR`) with updates off, and writes `smoke-title.png`, `smoke-cutscene.png`,
`smoke-objective.png` and `smoke-crash.log` to `test/out/` (CI uploads them as the `smoke`
artifact). About 90 s under xvfb with software GL.

```sh
npm run pack                                   # dist/linux-unpacked
xvfb-run -a -s "-screen 0 1280x800x24" npm run smoke -- dist/linux-unpacked/grand-theft-pundit
# or the AppImage, as CI does:
./dist/*.AppImage --appimage-extract && xvfb-run -a node test/smoke.js squashfs-root/grand-theft-pundit
```

On a Mac or Windows desktop no xvfb is needed; pass the app binary
(`dist/mac-arm64/Grand Theft Pundit.app/Contents/MacOS/Grand Theft Pundit`,
`dist/win-unpacked/Grand Theft Pundit.exe`).

## Mods folder

The desktop game loads your own files at startup, so you can change or add things without
rebuilding. The folder is created on first launch. **Open Mods Folder** is in the app menu on macOS
and in the Alt menu bar on Windows and Linux, and **Cmd/Ctrl+Shift+M** opens it everywhere:

| Platform | Folder |
| --- | --- |
| macOS | `~/Library/Application Support/Grand Theft Pundit/mods` |
| Windows | `%APPDATA%\Grand Theft Pundit\mods` |
| Linux | `~/.config/Grand Theft Pundit/mods` |

Every time the game loads, in file-name order:

- images (`png`, `jpg`, `webp`, `gif`, up to 8 MB each) become data URLs in
  `window.GTP_MODS.images["file-name.png"]`, ready for an `<img>`, a canvas or a three.js texture;
- `*.css` files are added to the page;
- `*.js` files run after the game's own scripts, so `window.GTP` (the whole game: content tables,
  cast, missions, UI, renderer) is available to them. Each runs in its own `try/catch`; failures are
  listed in `window.GTP_MODS.errors` and the console (Cmd+Option+I or Ctrl+Shift+I); uncaught
  errors also land in the crash log.

Rename a file (for example to `.js.off`) to turn it off, and restart the game after changes. Mods
are your own files on your own machine; they are not part of the release builds.

## Signing and notarization (optional, later)

Unsigned builds are fine for friends. To make the Gatekeeper and SmartScreen notices go away you
need an Apple Developer membership (Developer ID Application certificate) and, for Windows, an
Authenticode certificate. Nothing in the config needs to change; add these repository secrets
(*Settings > Secrets and variables > Actions*) and the workflow signs automatically:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | the *Developer ID Application* certificate exported from Keychain Access as a `.p12`, base64-encoded (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | the password you set when exporting the `.p12` |
| `APPLE_ID` | the Apple ID of the developer account, for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | an app-specific password made at <https://account.apple.com> for that Apple ID |
| `APPLE_TEAM_ID` | the 10-character Team ID shown in the developer account |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | (optional) Windows code-signing certificate as base64 `.pfx` plus its password |

With `CSC_LINK` and `CSC_KEY_PASSWORD` the macOS build is signed; with all three `APPLE_*`
secrets as well it is also notarized and stapled, so it opens on any Mac with no warning. Signed
builds are made with the hardened runtime (the workflow passes `-c.mac.hardenedRuntime=true`;
`electron-builder.yml` leaves it off for unsigned builds). The same works locally: export the same
names as environment variables and run

```sh
npx electron-builder --mac dmg zip --arm64 --x64 --publish never -c.mac.hardenedRuntime=true
```

electron-builder's own guide: <https://www.electron.build/code-signing>.

## Files

| Path | Purpose |
| --- | --- |
| `package.json` | name, product name, version, scripts, pinned `electron` and `electron-builder` |
| `main.js` | Electron main process: splash, the window, menus and shortcuts, permissions, external links, single instance, mods |
| `lib/updater.js` | automatic updates (electron-updater in install mode, release-page notice in notify mode) |
| `lib/window-state.js` | saves and restores size, position, maximized and full screen state |
| `lib/crash-log.js` | `logs/crash.log`, crash reporter (local minidumps only) |
| `splash/` | the boot splash page and its 224 px icon |
| `test/smoke.js` | the packaged-app smoke test CI runs |
| `sync-game.js` | copies the game into `app/` (CLI and `beforePack` hook) |
| `electron-builder.yml` | packaging config: app id `com.grievancecity.grandtheftpundit`, targets, dmg layout and background, artifact names |
| `build/dmg-background.html`, `build/make-dmg-background.js`, `build/background.png`, `build/background@2x.png` | the disk-image window artwork (drag arrow, first-launch hints) and its renderer |
| `build/icon.png` | 1024x1024 macOS-style icon (rounded tile with margin); electron-builder makes the `.icns` |
| `build/icon-full.png` | the same tile filling the canvas, used for the Windows `.ico` and Linux icons |
| `build/icon.html`, `build/make-icon.js` | the icon's source page and the Playwright script that renders both PNGs |
| `app/`, `dist/`, `node_modules/`, `test/out/` | generated, ignored by git |

### Regenerating the icon

`build/icon.html` draws the icon (gold arcade letters with a folding table for the T). The PNGs
are committed, so the normal build never needs a browser. To change the artwork, edit the HTML and
render it with Playwright, which is deliberately not a dependency of this package:

```sh
npx --yes playwright@1.56.1 install chromium       # once
NODE_PATH="$(npm root -g)" npm run icon            # or any directory where `playwright` resolves
```

The DMG background works the same way: edit `build/dmg-background.html` (560x400; the two icons
sit at (150,190) and (410,190) on the light band, matching `dmg.contents`) and run
`NODE_PATH="$(npm root -g)" npm run dmg-background`.
