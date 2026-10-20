# Grand Theft Pundit: desktop builds

This folder turns the browser game one level up (`index.html`, `js/`, `vendor/`) into a
downloadable desktop game with [Electron](https://www.electronjs.org/) and
[electron-builder](https://www.electron.build/). Nothing in the game changes: `sync-game.js`
copies the three game paths into `desktop/app/`, `main.js` opens that `index.html` in a window,
and electron-builder wraps the result into installers.

Targets:

| Platform | Output in `dist/` | Notes |
| --- | --- | --- |
| macOS, Apple Silicon (M1 and later) | `Grand-Theft-Pundit-0.2.0-mac-arm64.dmg` and `.zip` | drag to Applications |
| macOS, Intel | `Grand-Theft-Pundit-0.2.0-mac-x64.dmg` and `.zip` | |
| Windows 10/11, x64 | `Grand-Theft-Pundit-0.2.0-win-x64-setup.exe` (installer), `...-win-x64-portable.exe` (no install) | |
| Linux, x64 | `Grand-Theft-Pundit-0.2.0-linux-x86_64.AppImage` | `chmod +x`, then run |

The version in every file name comes from `package.json`; bump it there before tagging a release.

## Build locally on a Mac

Requirements: macOS 11 or newer, [Node.js](https://nodejs.org/) 20 or newer (22 is what the
release workflow uses), and a normal internet connection the first time (electron-builder downloads
the Electron binaries for each platform into `~/Library/Caches/electron`).

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

In the game: **F11**, **Cmd+F** (macOS) or **Ctrl+F** (Windows/Linux) toggle full screen, and
**Ctrl+Cmd+F** does too on macOS through the app menu. **Esc** is left to the game. Starting the
game a second time focuses the running window instead of opening another one.

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
`game/grand-theft-pundit` branch that touches the game or this folder. The builds appear as
artifacts on the run's page in the Actions tab. To publish a GitHub Release with download links,
either put `[release]` in the commit message (the release is tagged `v` plus the `version` in
`desktop/package.json`, so bump that first), or push a tag starting with `v`:

```sh
# bump "version" in desktop/package.json first so the file names match
git commit -m "Ship 0.2.0 [release]"     # or:
git tag v0.2.0 && git push origin v0.2.0
```

The macOS job runs on `macos-14` and produces the arm64 and x64 dmg/zip, the Windows job the
installer and portable exe, and the Linux job the AppImage. The last job creates (or updates, if it
exists) the release for that tag with every file attached and auto-generated notes. "Run workflow"
from the Actions tab builds the same files as workflow artifacts without a tag; fill in
`release_tag` with an existing tag to publish a release from a manual run.

`npm ci` is used when `package-lock.json` is committed (it is), so CI builds use exactly the
versions tested here; without a lockfile the workflow falls back to `npm install`.

## Mods folder

The desktop game loads your own files at startup, so you can change or add things without
rebuilding. The folder is created on first launch (on macOS the app menu has **Open Mods Folder**):

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
  listed in `window.GTP_MODS.errors` and the console (Cmd+Option+I or Ctrl+Shift+I).

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
| `main.js` | Electron main process: the window, fullscreen keys, permissions, external links, single instance |
| `sync-game.js` | copies the game into `app/` (CLI and `beforePack` hook) |
| `electron-builder.yml` | packaging config: app id `com.grievancecity.grandtheftpundit`, targets, dmg layout, artifact names |
| `build/icon.png` | 1024x1024 macOS-style icon (rounded tile with margin); electron-builder makes the `.icns` |
| `build/icon-full.png` | the same tile filling the canvas, used for the Windows `.ico` and Linux icons |
| `build/icon.html`, `build/make-icon.js` | the icon's source page and the Playwright script that renders both PNGs |
| `app/`, `dist/`, `node_modules/` | generated, ignored by git |

### Regenerating the icon

`build/icon.html` draws the icon (gold arcade letters with a folding table for the T). The PNGs
are committed, so the normal build never needs a browser. To change the artwork, edit the HTML and
render it with Playwright, which is deliberately not a dependency of this package:

```sh
npx --yes playwright@1.56.1 install chromium       # once
NODE_PATH="$(npm root -g)" npm run icon            # or any directory where `playwright` resolves
```
