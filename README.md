# Widsith Uploader

A small Windows app that sits in the tray and sends your Widsith recordings to the site after you play, so you never have to find the file yourself.

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
2. **Start.** After linking, the app lists the account's characters on this computer, each with an Uploading switch, all on, and one button: Start uploading. Every character left on is kept Private on the site, and so is every character played here later, without asking. You can make any of them Public on the site. A switch turned off here, then or at any time on the character's card, keeps that character on this computer only. Starting also sets the app to start when you sign in to Windows, so new play is sent without anyone having to open it; Settings can turn that off. Unlinking forgets the start, so the next link shows it again.
   Each card says where its character stands, with the mark the site uses for it: up to date, on its way or waiting to be sent, only on this PC (switched off, or removed on the site), or turned away by the site and why. The cards report and never ask a question: who sees a character and whether Battle.net has vouched for it are the site's to settle. A kept character's Private or Public mark opens the site's choice of who sees it, and its main button, View on Widsith, opens its page. A Retail or Classic character the site keeps but Battle.net hasn't verified yet says so in a quiet second line, with a link to the site's account page, where it is verified; a WoW Forever character never does, since Battle.net can't list those. The switch is the one thing a card changes.
   Each game's characters are one list, newest played first: by the site's last play for a character it keeps, else by when the game last wrote its file. Characters switched off or removed on the site stay in the list, drawn faded. The order is settled each time the window is shown and held while it is open, so a card doesn't move under the pointer; a character first found while it is open goes to the top. A kept character is named as the site names it, in full on WoW Forever.
   An earlier character, one deleted in the game whose name and realm a newer character took, has a card of its own under "Earlier characters" at the foot of its game, and is sent, if at all, as a character of its own under its own GUID. It is off until switched on, since nobody chose to keep it yet, and its card says that its recording stays on this PC until then. One the site already keeps (it was sent before it was deleted) is on, as it was. It isn't listed at the start, which speaks only for the characters in the game now.
3. **Send.** Every fifteen seconds the app checks whether a recording has changed. If it has, it splits the file into sessions, tells the site each session's time and SHA-256, and sends only the ones the site lacks, gzipped. Nothing pops up to say so.

The app shows a notification only when there is something for you to do, and only once for each thing. That happens when the site has unlinked this computer, when the site turns a character away for a reason the player can see to (another account already keeps the character, the recording doesn't say its region, or it names no character), when another account starts playing on this computer, and when a newer version of the addon is out than the one in your game. Any other refusal, such as one an older site gave, is taken as the site failing just now: the card says it will be tried again, and it is, a little later, with nothing notified.

Closing the window leaves the app in the tray, and clicking the tray icon opens it again. The tray's menu has three items: Open Widsith Uploader, Pause uploading and Quit.

Pausing stops the sending until you resume. While paused, the app still notices new play and reads it, so the window stays current, but it sends nothing, asks the site nothing and shows no notification. The switches and the start still take effect while paused, and whatever they would send waits for the resume. The menu item reads Resume uploading and the tray's flame turns grey for as long as it lasts. Resuming looks again at once and sends whatever is owed. The pause is remembered when the app starts again.

## The code

| Where | What |
| --- | --- |
| `src/core/` | Everything the app decides, in plain TypeScript with no Windows or window code in it. `engine.ts` is the whole behaviour, `sync.ts` sends one recording, `sessions.ts` splits a file, `api.ts` is every request. |
| `src/shared/lua.ts` | The reader for the game's saved files. A copy of the site's, kept identical by a test (`npm run shared` brings it level). |
| `src/host/tauri.ts` | The real computer, answering what the engine asks. |
| `src/ui/` | The window (Svelte), in the site's look: `App.svelte` chooses what shows, `Cards.svelte` and `Card.svelte` are the characters, `Face.svelte` a character's ring and class icon, `Setup.svelte` the start after linking, `Settings.svelte` the rest. `Logo.svelte` is the site's flame, copied and kept identical by a test (`npm run shared` brings it level). `demo.ts` lets the window open in an ordinary browser with made-up characters. |
| `src-tauri/` | The Rust side: the narrow commands that touch the computer, the tray, the installer settings. |
| `tests/` | The engine against a made-up computer and a made-up site, and the shared files against the site's. |
| `scripts/` | `build-tray-icon.mjs` and `build-app-icon.mjs` draw the tray's two pictures (the flame lit, and grey while uploading is paused) and the app's icon, the site's flame on a midnight disc, from the flame in `src/ui/Logo.svelte`; `npm run icons` then makes every size of the app's icon. `sync-shared.mjs` brings the shared files level with the site's. `need-update-key.mjs` stops a release build that has no update key (see Self-update). `notices.mjs` writes `THIRD-PARTY-NOTICES.txt` (see Licence). |

## Working on it

Needs Node 22, Rust, and on Windows the Visual Studio C++ build tools.

```
npm install
npm test            # the engine and the file splitter
npm run check       # types
npm run dev:web     # the window alone in a browser, at http://localhost:1420/?demo=linked
npm run dev         # the real app, rebuilt as you edit
npm run build       # the app and its installer, under src-tauri/target/release, able to talk to a local or preview site
npm run release     # the same, built to be handed out: it talks to widsith.app and nothing else
npm run ship -- 0.2.1   # the whole release: the version raised and tagged, the checks, the build, the signatures read, and the site's download brought level when `WIDSITH_SITE` names the site's source
npm run notices     # THIRD-PARTY-NOTICES.txt written again, before a release whenever a dependency has changed
```

`?demo=` takes `new`, `linking`, `setup`, `linked`, `paused`, `empty` and `update`. The last shows a newer version ready to go in, and `&state=downloading` or `&state=failed` shows its other states.

GitHub Actions runs the type check and the tests for every pull request and for `main` (`.github/workflows/app.yml`), and, when the Rust code changes, `cargo fmt --check` and `cargo test` on Windows (`rust.yml`).

To point the app at a copy of the site on this computer, set `WIDSITH_SERVER` before starting it. Only `http://localhost:<port>` and `https://<name>.vercel.app` are accepted, and each keeps its own token.

```
set WIDSITH_SERVER=http://localhost:5188
npm run dev
```

To read the real app's window from a script, start it with the WebView's debugging port open and connect with any DevTools client. With `--hidden` it starts in the tray without showing its window.

```
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9555
src-tauri\target\release\widsith-uploader.exe --hidden
```

The app keeps its bookkeeping (which files it has sent, which characters are switched off, which earlier characters are switched on, which the site said were removed, whether uploading was started for each account, whether it is paused, which notifications it has shown) in `%APPDATA%\app.widsith.uploader\state.json`. Deleting that file loses no recording, since the site already knows what it has and which characters were removed; the app shows the start again, and may show a notification a second time.

A build that is handed out is made with `npm run release`: it uses `src-tauri/capabilities/release.json`, whose allow-list admits `https://widsith.app` alone, and the `public` Cargo feature, under which `WIDSITH_SERVER` is ignored. `npm run build` keeps the development allow-list so the app can be tried against a local or preview site.

## Signing

A release build signs the app and the installer with Reflective Grove LLC's certificate through Azure Artifact Signing, so Windows names the publisher instead of warning. `scripts/sign.ps1` does it and the Tauri config runs it for every file it bundles; `scripts/signing.json` names the signing account and certificate profile, which is not secret. The machine that builds a release needs the Artifact Signing client tools (`winget install -e --id Microsoft.Azure.ArtifactSigningClientTools`), SignTool from a Windows SDK of build 22621 or later, and an Azure CLI signed in (`az login`) as an account that may sign with that profile. Without the client tools the script says so and the build goes on unsigned, so anyone can build the app for themselves. A signature can be read with `Get-AuthenticodeSignature` in PowerShell, or on the file's Properties page.

## Self-update

The app keeps itself up to date without asking anything of the player.

1. **Check.** Half a minute after it starts, and every six hours after that, it reads the site's update feed, `https://widsith.app/downloads/uploader-update.json`. The feed names the newest version, where its installer is, and the installer's signature. Nothing is asked while uploading is paused, since the app then asks the site nothing.
2. **Download.** When the feed names a newer version than the one running, the app downloads that installer at once and checks its signature against the public key in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). An installer whose signature doesn't match is thrown away. The signature also names the version it was made for, and an installer offered under any other version is refused (`requireSignedVersion`), so an old release can't be passed off as a new one. The window shows a thin line above everything while this happens.
3. **Install.** Once downloaded, the window offers "Restart to update". The update also goes in by itself once it has been ready for ten minutes and the window hasn't been looked at for ten minutes, and never while a file is being sent. The installer runs without asking anything (its passive mode, a progress bar alone), and starts the new version when it has finished. The new version shows its window if the player asked for the update, and stays in the tray if the app updated by itself, so it never pops up in front of the game. The app leaves itself a note in its settings folder (`after-update.json`) to know which, because the installer starts it again with the arguments it was first started with.

A download or install that fails is said in the window and tried again at the next check. A feed that can't be read says nothing.

**The key.** The updater signature is separate from the Authenticode signature under Signing: it is a minisign key that only this app's updater trusts. The private key is `%USERPROFILE%\.tauri\widsith-uploader.key` on the release machine, made with `npx tauri signer generate -w <that path>`, which asks for a password and prints the public key for `plugins.updater.pubkey`. The key has a password, and both are kept safe away from that machine. It never goes into this repository; with its password, a copied key file is useless by itself. A stolen key alone can't reach a player either, since the app takes updates only from the feed on widsith.app.

To change the key while the old one is still at hand, make the new one, put its public key in `plugins.updater.pubkey`, and ship that version signed with the old key: every installed copy takes it as an ordinary update and trusts only the new key from then on. Only a lost key means a hand install: no installed copy will accept an update signed by anything else, so every player would download and install the version with the new public key by hand once.

`npm run release` needs the key, and stops at once without it (`scripts/need-update-key.mjs`). Set `TAURI_SIGNING_PRIVATE_KEY` to the key file's path or to its contents before building:

```
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\widsith-uploader.key"
npm run release
```

**The whole release in one go** is `npm run ship -- <version>` (`scripts/release.ps1`), where the version is a number like `0.2.1` or the word `patch`, `minor` or `major`. It releases only merged code: it stops unless this repository is on `main` and the same as `main` on GitHub (it fetches to check), and, when `WIDSITH_SITE` names a checkout of the site's source, unless that checkout is on a branch of its own, where the installer's commit then lands for a pull request. From a clean working tree it finds the key in the profile folder and sets the variable itself, checks that the Azure CLI is signed in and that no copy of the app is running (a running copy holds its own exe open and the build fails late), raises the version in every file that carries it (`scripts/bump-version.mjs`: package.json, the lockfile, the Tauri config, Cargo.toml and Cargo.lock) as one commit tagged `v<version>`, runs `npm run release`, reads the installer's certificate signature back and checks the updater's `.sig` is beside it, and then, when `WIDSITH_SITE` is set, runs the site's `npm run pack-uploader -- --signed`, commits the download and the feed on the site's current branch, and says what to push in each repository. It stops at the first thing that is missing and pushes nothing. `npm run build` is for building and trying the app on this computer; `ship` is for handing it out.

The release build runs with the CLI's `--ci` flag, so it never asks for the key's password at the keyboard: it takes `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when that is set, and an empty password otherwise. `npm run ship` asks for the password once, before the build, unless the variable is already set; `npm run release` on its own needs it set beforehand. The release build (`src-tauri/tauri.release.conf.json`, `createUpdaterArtifacts`) then writes `Widsith Uploader_<version>_x64-setup.exe.sig` beside the installer in `src-tauri/target/release/bundle/nsis`. `npm run build` makes no signature and needs no key, so anyone can still build the app for themselves.

**The feed.** The site's `npm run pack-uploader -- --signed` copies the installer into the site, reads the `.sig` beside it, and writes `static/downloads/uploader-update.json`. It refuses to run with `--signed` when there is no `.sig`, since a release without one can't be offered as an update. Every copy installed from then on finds the new version within six hours of the site going live.

**Trying it against a local site.** The app reads the feed from whichever site it talks to, at `/downloads/uploader-update.json`. A build being worked on (`npm run dev`) looks for updates only when `WIDSITH_SERVER` is set, so it never asks the real site. To try an update, build a release with a higher version, put its installer and a feed for it in the local site's `static/downloads/` (the feed's `url` pointing at the local copy), and start the app against that site:

```
set WIDSITH_SERVER=http://localhost:5188
npm run dev
```

A build made with `npm run build` refuses a feed at a plain `http://` address, as the updater allows only `https` outside development. A preview site on `https://<name>.vercel.app` works with either.

## Still to do

- Build releases in CI from a tagged commit, and publish the installer's checksum. The update key and its password would then live in the CI's secrets as well as on the release machine.
- Players with 0.2.0 or earlier have no updater: they install the first version that has one by hand, once.
- Measure memory while it sits in the tray during play.
- A Mac build.

## Licence

All rights reserved, Reflective Grove LLC; the terms are in `LICENSE.txt`. The installer shows it on a first install and puts a copy beside the app (`bundle.licenseFile` and `bundle.resources`); an update installs passively and shows nothing. Using the app is also covered by the site's Terms of Service and Privacy page, which the window says before linking and under About.

The app is built from open-source works: the Rust crates compiled into it, the npm packages in its window's code, its two fonts, and the Phosphor icons it draws. Their licences are collected in `THIRD-PARTY-NOTICES.txt`, which `npm run notices` (`scripts/notices.mjs`) writes from the Rust and npm dependencies as installed, and the installer puts it beside the app too.

Copyright (c) 2026 Reflective Grove LLC.
