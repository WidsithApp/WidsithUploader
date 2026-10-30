# What changed

Each version of Widsith Uploader, newest first, with the date it was handed out. An installed copy updates itself to the newest version within a few hours of its release.

## 0.4.7 · 2026-10-30

- A new install greets you first. It asks whether the app should start when you sign in to Windows, says that closing the window leaves it in the tray, and opens the taskbar settings where you can keep its icon in view.
- The site's new logo in the window, and the flame alone in the tray and as the app's icon.
- Ready for WoW Forever's launch: recordings from the released client's folder, `_forever_`, are found and sent as the beta's were, and shown under WoW Forever.
- The libraries that check the site's certificate, and the one the app reads and writes files with, brought up to date.
- A session too large for the site to take no longer holds up the rest of the character's play. It stays on this PC, the card says so, and it is tried again only if it grows.

## 0.4.5 · 2026-10-23

- Reading files and searching drives no longer runs on the window's thread, and the search for the game skips network drives, so a dead network share no longer stalls the app.
- The licences of everything the app is built from are installed beside it, in THIRD-PARTY-NOTICES.txt.
- The README and the site's privacy page say exactly what the app's token can do: send sessions, ask which characters the account keeps, and unlink itself. It can never read a recording, change who sees a character or delete anything.

## 0.4.4 · 2026-10-20

- The licence text updated.

## 0.4.3 · 2026-10-17

- Each card has View on Widsith, which opens the character's page, and its sharing mark opens the sharing choice on the site.
- "Not yet verified" is said only where Battle.net could list the character, and the app no longer tells you to sign in again.
- Time played and time recorded are shown apart, cards are in last-played order, and a remade character's earlier sessions are shown as their own row.
- Two libraries with known flaws updated.

## 0.4.1 · 2026-10-13

- WoW Forever characters are named in full on their cards, first name and surname.
- The window is never narrower than 520 pixels, so a card's buttons stay on one row.

## 0.4.0 · 2026-10-13

- A link is to a Battle.net account, not to the computer. Each account on the PC is linked on its own and sends only its own recordings; an unlinked account sends nothing.
- No more question about new characters. After linking, a start screen lists the account's characters with a switch each, and from then on every character goes up Private by itself. You make any of them Public on the site.
- Cards show where each character stands, never a choice. A character removed on the site is not sent again until you switch it back on.
- The app keeps itself up to date from a signed feed on widsith.app, installing when you ask or by itself when left alone.
- The installer shows the licence, and About says what the app reads and how it updates.

## 0.2.0 · 2026-10-09

- The site's look, with each character as a card, grouped by game.
- Notifications only for what you must do. Pause from the tray. The window names your browser when it offers to link.
- The app and its installer are signed by Reflective Grove LLC.

## 0.1.3 · 2026-10-05

The first build for testing: it finds each character's recording, links to the site with a short code, and sends new play as it is saved.
