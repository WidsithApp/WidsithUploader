# Widsith Uploader

A small Windows app that sits in the tray and sends your Widsith recordings to [widsith.app](https://widsith.app) after you play, so you never have to find the file yourself.

The Widsith addon writes one file per character, `Widsith.lua`, each time you log out or reload the game. This app notices the file has changed, works out which play sessions in it the site doesn't have yet, and sends those.

## What it does and doesn't do

It reads:

- Battle.net's list of installed games, to find where World of Warcraft is.
- `Widsith.lua` in each character's `SavedVariables` folder, and `WoWJourney.lua` there too: before version 0.3.0 the addon went by its earlier name, WoWJourney, and wrote its file by that name. No other saved file.
- `Widsith.toc` in the addon's folder (or `WoWJourney.toc` where only the older copy is installed), for the addon's version.
- Which browser Windows opens web links in, from your settings in the registry, so the window can say "Open Chrome" when it links the computer. The name is never sent.

It sends, to the one site named under About in its settings:

- Each new play session from those recordings, and the character table the recording carries (its game identifier, name, realm, region, class, race, sex and faction).
- This computer's name, once, when you link it.

A computer can hold more than one Battle.net account: someone else who plays here, or your own second account. The game keeps each account's recordings in a folder named by the account's Battle.net ID, and a link is to an account, not to the computer: the site says which account approved the link, and that link sends only that account's folders. Each account is linked on its own, is started on its own, and can be unlinked on its own. An account nobody has linked is shown in the window, under "Another account plays on this computer", and nothing of its is sent. When the window is shown it opens on the linked account played most recently.

It also asks the same site, a little after it starts and then every six hours, whether there is a newer version of the app, and downloads it from there when there is. That request carries nothing about you or your characters.

It never:

- Sends what your character said in /say or /yell. Older versions of the addon wrote those lines; the app leaves them out of every session before sending it, and the site keeps no chat.
- Sends anything for a character the site doesn't keep yet until you have started uploading. That is done once, after linking, with your characters listed and a switch beside each, so you can leave any of them out before anything is sent.
- Sends another account's recordings under your link. An account folder that isn't linked sends nothing, whoever is at the keyboard.
- Sends a character you switched off. The app says plainly that such a character is not saved anywhere: its recording is only the file in your WoW folder.
- Sends a character as Public. Everything the app sends is kept Private, and Public is chosen on the site.
- Sends one character's sessions as another's. When a character is deleted in the game and a new one is made with the same name on the same realm, the game keeps the old one's file for the new one, so the file holds both characters' sessions. The app sends each session only as the character that played it, as its first line says.
- Sends a character you removed on the site, until you switch it back on. The site says which characters were removed, so this holds however the app was set up before. Switching one back on sends all of it, the sessions you deleted too.
- Changes whether a kept character is Private or Public. That is changed on the site, and the site ignores anything the app says about a character it already keeps.
- Shows a notification to say it has sent something. Sending is quiet.
- Writes into the game's folders.
- Reads your recordings on the site, or deletes anything there. Its token can send sessions, ask which characters the account keeps so the cards can be drawn, and unlink itself; nothing else.

These aren't promises resting on good behaviour alone. The window can't open files or reach the network by itself. Files are reached only through the commands in `src-tauri/src/main.rs`, and `read_recording` refuses any path that isn't a recording. Requests go only through an allow-list in `src-tauri/capabilities/default.json`. Every request the app can make is in `src/core/api.ts`, apart from the update feed and the new installer, which the Rust side fetches from the same site (`update_check` and `update_download` in `src-tauri/src/main.rs`).

## How it works

1. **Link.** The app asks the site for a pair of codes and opens the site's `/link` page with the short one, or gives you the link to open in whichever browser you like. You sign in there with Battle.net and approve it. The app then receives a token of its own, kept in Windows Credential Manager. It never sees your Battle.net sign-in. You can unlink the computer from the app, or from your library on the site.
2. **Start.** After linking, the app lists the account's characters on this computer, each with an Uploading switch, all on, and one button: Start uploading. Every character left on is kept Private on the site, and so is every character played here later, without asking. You can make any of them Public on the site. A switch turned off here, then or at any time on the character's card, keeps that character on this computer only. Starting also sets the app to start when you sign in to Windows, so new play is sent without anyone having to open it; Settings can turn that off. Each character's card then says where it stands, with the mark the site uses for it, and its View on Widsith button opens its page.
3. **Send.** Every fifteen seconds the app checks whether a recording has changed. If it has, it splits the file into sessions, tells the site each session's time and SHA-256, and sends only the ones the site lacks, gzipped. Nothing pops up to say so. A session the site won't take for its size stays on this PC and the character's card says so; everything else is sent as usual.

The app shows a notification only when there is something for you to do, and only once for each thing: the site has unlinked this computer, the site has turned a character away for a reason you can see to, another account has started playing on this computer, or a newer version of the addon is out than the one in your game. Anything else, such as the site not answering, is tried again a little later, quietly.

Closing the window leaves the app in the tray, and clicking the tray icon opens it again. The tray's menu has three items: Open Widsith Uploader, Pause uploading and Quit. While paused the app still notices new play and reads it, so the window stays current, but it sends nothing, asks the site nothing and shows no notification; the tray's flame turns grey for as long as it lasts, and resuming sends whatever is owed. The pause is remembered when the app starts again.

## Self-update

The app keeps itself up to date without asking anything of you. Half a minute after it starts, and every six hours after that, it reads the site's update feed. When the feed names a newer version than the one running, the app downloads that installer and checks its signature against the public key built into the app (`plugins.updater.pubkey` in `src-tauri/tauri.conf.json`). An installer whose signature doesn't match, or that is offered under a version its signature wasn't made for, is thrown away. Once downloaded, the window offers "Restart to update". The update also goes in by itself once it has been ready for ten minutes and the window hasn't been looked at for ten minutes, never while a file is being sent; the installer runs without asking anything and starts the new version, which stays in the tray if the app updated by itself, so it never pops up in front of the game. A download or install that fails is said in the window and tried again at the next check.

## Building it yourself

Needs Node 22, Rust, and on Windows the Visual Studio C++ build tools.

```
npm install
npm test            # the engine and the file splitter
npm run check       # types
npm run dev:web     # the window alone in a browser, at http://localhost:1420/?demo=linked
npm run dev         # the real app, rebuilt as you edit
npm run build       # the app and its installer, under src-tauri/target/release
npm run notices     # THIRD-PARTY-NOTICES.txt written again, whenever a dependency has changed
```

`?demo=` takes `new`, `linking`, `setup`, `linked`, `paused`, `empty` and `update`. The last shows a newer version ready to go in, and `&state=downloading` or `&state=failed` shows its other states.

GitHub Actions runs the type check and the tests for every pull request and for `main` (`.github/workflows/app.yml`), and, when the Rust code changes, `cargo fmt --check` and `cargo test` on Windows (`rust.yml`).

To point the app at a copy of the site on this computer, set `WIDSITH_SERVER` before starting it. Only `http://localhost:<port>` and `https://<name>.vercel.app` are accepted, and each keeps its own token. A build being worked on looks for updates only when `WIDSITH_SERVER` is set, so it never asks the real site.

```
set WIDSITH_SERVER=http://localhost:5188
npm run dev
```

To read the real app's window from a script, start it with the WebView's debugging port open and connect with any DevTools client. With `--hidden` it starts in the tray without showing its window.

```
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9555
src-tauri\target\release\widsith-uploader.exe --hidden
```

The app keeps its bookkeeping (which files it has sent, which characters are switched off, which the site said were removed, whether uploading was started for each account, whether it is paused, which notifications it has shown) in `%APPDATA%\app.widsith.uploader\state.json`. Deleting that file loses no recording, since the site already knows what it has and which characters were removed; the app shows the start again, and may show a notification a second time.

A build made with `npm run build` is unsigned and keeps the development allow-list, so it can be tried against a local or preview site. Anyone can build and run it.

## The code

| Where | What |
| --- | --- |
| `src/core/` | Everything the app decides, in plain TypeScript with no Windows or window code in it. `engine.ts` is the whole behaviour, `sync.ts` sends one recording, `sessions.ts` splits a file, `api.ts` is every request. |
| `src/shared/lua.ts` | The reader for the game's saved files. A copy of the site's, kept identical by a test (`npm run shared` brings it level). |
| `src/host/tauri.ts` | The real computer, answering what the engine asks. |
| `src/ui/` | The window (Svelte), in the site's look: `App.svelte` chooses what shows, `Cards.svelte` and `Card.svelte` are the characters, `Face.svelte` a character's ring and class icon, `Setup.svelte` the start after linking, `Settings.svelte` the rest. `Logo.svelte` is the site's flame, copied and kept identical by a test. `demo.ts` lets the window open in an ordinary browser with made-up characters. |
| `src-tauri/` | The Rust side: the narrow commands that touch the computer, the tray, the installer settings. |
| `tests/` | The engine against a made-up computer and a made-up site, and the shared files against the site's when `WIDSITH_SITE` names a checkout of its source. |
| `scripts/` | `build-tray-icon.mjs` and `build-app-icon.mjs` draw the tray's two pictures and the app's icon from the flame in `src/ui/Logo.svelte`; `npm run icons` then makes every size of the app's icon. `sync-shared.mjs` brings the shared files level with the site's. `notices.mjs` writes `THIRD-PARTY-NOTICES.txt`. `release.ps1`, `sign.ps1` and `need-update-key.mjs` are for releases. |

## Releasing

A release is built with `npm run release`, or `npm run ship -- <version>`, which also raises the version and tags it. It is signed twice: the app and its installer with Reflective Grove LLC's certificate through Azure Artifact Signing (`scripts/sign.ps1`), so Windows names the publisher instead of warning, and the installer with the updater's own key, which only this app's updater trusts. Both keys are Reflective Grove's and are not in this repository, so `release` and `ship` stop without them. A release build uses `src-tauri/capabilities/release.json`, whose allow-list admits widsith.app and this repository alone, and the `public` Cargo feature, under which `WIDSITH_SERVER` is ignored.

## Licence

All rights reserved, Reflective Grove LLC; the source is open for anyone to read, and the terms are in `LICENSE.txt`. The installer shows it on a first install and puts a copy beside the app.

The official app is the signed installer from widsith.app, and installed copies update themselves only from there. A copy from anywhere else, one someone else built from this source, or a changed one, isn't ours: we can't support it and aren't responsible for what it does. Using the app is also covered by the site's Terms of Service and Privacy page, which the window says before linking and under About.

The app is built from open-source works: the Rust crates compiled into it, the npm packages in its window's code, its two fonts, and the Phosphor icons it draws. Their licences are collected in `THIRD-PARTY-NOTICES.txt`, which `npm run notices` writes from the Rust and npm dependencies as installed, and the installer puts it beside the app too.

Copyright (c) 2026 Reflective Grove LLC.
