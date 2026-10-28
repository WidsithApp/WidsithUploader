// Widsith Uploader, the part that touches the computer.
//
// The window (the TypeScript in ../src) decides what to do; it can't read a file or reach the
// network by itself. Everything it may ask of the computer is one of the commands below, and each
// does one narrow thing:
//
//   find_installs     where World of Warcraft is installed
//   as_install        whether a folder the player picked is one of those
//   scan_recordings   which characters under it have a recording file
//   read_recording    one such file's bytes, and no other file's
//   addon_versions    which version of the addon is installed there
//   secret_*          this computer's token, in Windows Credential Manager
//   state_*           the app's own bookkeeping, in its settings folder
//   computer_name     what to call this computer on the site
//   default_browser   what to call the browser web links open in
//   server_url        which site it talks to
//   set_paused        the tray's word and picture for whether uploading is paused
//   update_*          a newer version of the app: found, downloaded, installed
//
// It never writes into the game's folders.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    async_runtime::Mutex,
    image::Image,
    ipc::Response,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Url, WindowEvent, Wry,
};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The addon's saved file, one per character, which the game names after the addon's folder.
/// Before version 0.3.0 the addon went by its earlier name, WoWJourney: those files are read too,
/// so a character's earlier play is still sent, though the addon never writes to them again.
const RECORDING_FILES: [&str; 2] = ["Widsith.lua", "WoWJourney.lua"];
/// The addon's folder under Interface/AddOns by the same two names, newest first. Its table of
/// contents is named after the folder.
const ADDON_FOLDERS: [&str; 2] = ["Widsith", "WoWJourney"];
/// Where the token is kept in the system's credential store.
const CREDENTIAL_SERVICE: &str = "app.widsith.uploader";
const DEFAULT_SERVER: &str = "https://widsith.app";
/// A recording is a few megabytes, tens at the very most; anything past this isn't one, and
/// reading it whole into the window would only freeze the app.
const MAX_RECORDING_BYTES: u64 = 64 << 20;
/// The tray's picture: the Widsith flame on a midnight disc, the mark the site shows in its header
/// and the addon by the minimap, drawn with three layers so it still reads at sixteen pixels.
/// Drawn by scripts/build-tray-icon.mjs from the same outline the window's flame uses.
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");
/// The same flame drawn in greys, put out, while the player has paused uploading. Drawn by the
/// same script.
const TRAY_PAUSED_ICON: &[u8] = include_bytes!("../icons/tray-paused.png");
/// The tray's name for the app, shown when the pointer rests on its icon.
const TRAY_TOOLTIP: &str = "Widsith Uploader";
/// How often the window is told to look for new play.
const TICK: Duration = Duration::from_secs(15);
/// Where the site publishes the newest version of the app, under whichever site it talks to.
const UPDATE_FEED: &str = "/downloads/uploader-update.json";
/// The note the app leaves itself before an update, read once when it starts again.
const AFTER_UPDATE_FILE: &str = "after-update.json";
/// A note older than this is not from the update that just finished, and is ignored.
const AFTER_UPDATE_FRESH: Duration = Duration::from_secs(15 * 60);

// ---- Finding the game ---------------------------------------------------------------------------

/// A game folder inside the install: `_retail_`, `_classic_era_` and so on.
fn is_flavor(name: &str) -> bool {
    name.len() > 2 && name.starts_with('_') && name.ends_with('_')
}

fn subfolders(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    found.sort();
    found
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn flavors(root: &Path) -> Vec<PathBuf> {
    subfolders(root)
        .into_iter()
        .filter(|path| is_flavor(&name_of(path)))
        .collect()
}

/// A folder that holds World of Warcraft: it has at least one game folder with the game's own
/// `WTF` or `Interface` folder inside.
fn is_install(root: &Path) -> bool {
    flavors(root)
        .iter()
        .any(|flavor| flavor.join("WTF").is_dir() || flavor.join("Interface").is_dir())
}

fn shown(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}

/// Runs a command's work on a worker thread, away from the thread the window and the tray answer
/// on, so a slow disk or a network drive that has gone away never freezes them. Should the work
/// panic, the command answers `failed` (a release build, which aborts on a panic, never gets
/// that far).
async fn off_main<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static, failed: T) -> T {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or(failed)
}

/// Whether a drive letter is a network share, which Windows can say without reaching the share.
#[cfg(windows)]
fn is_network_drive(drive: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{
        Storage::FileSystem::GetDriveTypeW, System::WindowsProgramming::DRIVE_REMOTE,
    };
    let root: Vec<u16> = drive.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: `root` is a nul-terminated wide string that outlives the call.
    unsafe { GetDriveTypeW(root.as_ptr()) == DRIVE_REMOTE }
}

#[cfg(not(windows))]
fn is_network_drive(_drive: &Path) -> bool {
    false
}

/// Where World of Warcraft is installed: what Battle.net's own list says, then the usual places
/// on every drive.
#[tauri::command]
async fn find_installs() -> Vec<String> {
    off_main(find_installs_blocking, Vec::new()).await
}

fn find_installs_blocking() -> Vec<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(program_data) = std::env::var_os("ProgramData") {
        let list = PathBuf::from(program_data)
            .join("Battle.net")
            .join("Agent")
            .join("aggregate.json");
        if let Ok(text) = fs::read_to_string(list) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                for game in value["installed"].as_array().into_iter().flatten() {
                    let is_wow = game["product_id"]
                        .as_str()
                        .is_some_and(|id| id.starts_with("wow"));
                    if let (true, Some(icon)) = (is_wow, game["icon_path"].as_str()) {
                        if let Some(folder) = Path::new(icon).parent() {
                            candidates.push(folder.to_path_buf());
                        }
                    }
                }
            }
        }
    }

    const USUAL: [&str; 5] = [
        "World of Warcraft",
        "Games\\World of Warcraft",
        "Program Files (x86)\\World of Warcraft",
        "Program Files\\World of Warcraft",
        "Blizzard\\World of Warcraft",
    ];
    for letter in b'C'..=b'Z' {
        let drive = PathBuf::from(format!("{}:\\", letter as char));
        // A dead share stalls `exists()` for half a minute, and an install on a share is found
        // through Battle.net's own list anyway.
        if is_network_drive(&drive) {
            continue;
        }
        if !drive.exists() {
            continue;
        }
        for place in USUAL {
            candidates.push(drive.join(place));
        }
    }

    let mut seen: Vec<String> = Vec::new();
    let mut installs: Vec<String> = Vec::new();
    for candidate in candidates {
        let text = shown(&candidate);
        let key = text.trim_end_matches('\\').to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        if is_install(&candidate) {
            installs.push(text.trim_end_matches('\\').to_string());
        }
    }
    installs
}

/// The install a picked folder belongs to: itself, or its parent if a game folder was picked.
#[tauri::command]
async fn as_install(path: String) -> Option<String> {
    off_main(move || as_install_blocking(path), None).await
}

fn as_install_blocking(path: String) -> Option<String> {
    let picked = PathBuf::from(&path);
    if is_install(&picked) {
        return Some(shown(&picked));
    }
    let parent = picked.parent()?;
    if is_flavor(&name_of(&picked)) && is_install(parent) {
        return Some(shown(parent));
    }
    None
}

// ---- Recordings ---------------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Found {
    path: String,
    /// The account folder under WTF/Account: the Battle.net account ID and a licence number,
    /// `12345678#1`, on any install made since the game named them so; a name in capitals on an
    /// older one.
    account: String,
    flavor: String,
    realm: String,
    character: String,
    /// When the game last wrote it, ms since the epoch.
    modified: u64,
    size: u64,
}

/// Every character's recording under an install:
/// `<game folder>/WTF/Account/<account>/<realm>/<character>/SavedVariables/Widsith.lua`, and the
/// same file under the addon's earlier name.
#[tauri::command]
async fn scan_recordings(root: String) -> Vec<Found> {
    off_main(move || scan_recordings_blocking(root), Vec::new()).await
}

fn scan_recordings_blocking(root: String) -> Vec<Found> {
    let mut found = Vec::new();
    for flavor in flavors(Path::new(&root)) {
        for account in subfolders(&flavor.join("WTF").join("Account")) {
            for realm in subfolders(&account) {
                for character in subfolders(&realm) {
                    for name in RECORDING_FILES {
                        let file = character.join("SavedVariables").join(name);
                        let Ok(about) = fs::metadata(&file) else {
                            continue;
                        };
                        if !about.is_file() {
                            continue;
                        }
                        let modified = about
                            .modified()
                            .ok()
                            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                            .map_or(0, |since| since.as_millis() as u64);
                        found.push(Found {
                            path: shown(&file),
                            account: name_of(&account),
                            flavor: name_of(&flavor),
                            realm: name_of(&realm),
                            character: name_of(&character),
                            modified,
                            size: about.len(),
                        });
                    }
                }
            }
        }
    }
    found
}

/// Whether a path is a character's recording and nothing else: the addon's file, in a
/// SavedVariables folder, under the game's WTF/Account.
fn is_recording_path(path: &Path) -> bool {
    let parts: Vec<String> = path
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let count = parts.len();
    if count < 8 || parts.iter().any(|part| part == "..") {
        return false;
    }
    RECORDING_FILES
        .iter()
        .any(|name| parts[count - 1] == name.to_lowercase())
        && parts[count - 2] == "savedvariables"
        && parts[count - 6] == "account"
        && parts[count - 7] == "wtf"
        && is_flavor(&parts[count - 8])
}

/// A recording file's bytes. Refuses any path that isn't a recording.
#[tauri::command]
async fn read_recording(path: String) -> Result<Response, String> {
    let failed = Err("The recording couldn't be read.".into());
    off_main(move || read_recording_blocking(path), failed).await
}

fn read_recording_blocking(path: String) -> Result<Response, String> {
    let file = PathBuf::from(&path);
    if !is_recording_path(&file) {
        return Err("Not a recording file.".into());
    }
    let about = fs::metadata(&file).map_err(|error| error.to_string())?;
    if about.len() > MAX_RECORDING_BYTES {
        return Err("Too large to be a recording.".into());
    }
    fs::read(&file)
        .map(Response::new)
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
struct Addon {
    flavor: String,
    version: Option<String>,
}

/// Where the addon is installed under an install, and the version its table of contents gives.
/// A copy under the earlier name counts only where there is none under the current one.
#[tauri::command]
async fn addon_versions(root: String) -> Vec<Addon> {
    off_main(move || addon_versions_blocking(root), Vec::new()).await
}

fn addon_versions_blocking(root: String) -> Vec<Addon> {
    let mut addons = Vec::new();
    for flavor in flavors(Path::new(&root)) {
        let Some(text) = ADDON_FOLDERS.iter().find_map(|folder| {
            let toc = flavor
                .join("Interface")
                .join("AddOns")
                .join(folder)
                .join(format!("{folder}.toc"));
            fs::read_to_string(toc).ok()
        }) else {
            continue;
        };
        let version = text.lines().find_map(|line| {
            line.trim()
                .strip_prefix("## Version:")
                .map(|rest| rest.trim().to_string())
        });
        addons.push(Addon {
            flavor: name_of(&flavor),
            version,
        });
    }
    addons
}

// ---- The tokens, and the app's own notes --------------------------------------------------------

/// One entry per link: `key` is the site's address, and for a link made since the app told the
/// computer's accounts apart, the address and the account's Battle.net ID joined by `|`.
fn credential(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, key).map_err(|error| error.to_string())
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    match credential(&key)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    credential(&key)?
        .set_password(&value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn secret_clear(key: String) -> Result<(), String> {
    match credential(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    Ok(folder.join("state.json"))
}

#[tauri::command]
fn state_load(app: AppHandle) -> Option<String> {
    fs::read_to_string(state_file(&app).ok()?).ok()
}

/// Written beside itself first, then moved into place, so a crash never leaves half a file.
#[tauri::command]
fn state_save(app: AppHandle, json: String) -> Result<(), String> {
    let file = state_file(&app)?;
    let draft = file.with_extension("json.new");
    fs::write(&draft, json).map_err(|error| error.to_string())?;
    fs::rename(&draft, &file).map_err(|error| error.to_string())
}

/// Windows' taskbar settings, where the player can keep the tray icon beside the clock. Windows
/// decides which tray icons show there and no app may promote its own, so this opens that one
/// page and nothing else; the window's own link opener stays limited to the site.
#[tauri::command]
fn open_taskbar_settings(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("ms-settings:taskbar", None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn computer_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "This computer".into())
}

/// What to call the browser Windows opens web links in, so the window can say "Open Chrome"
/// rather than "your browser". None when it can't be told; the window then says the latter.
#[tauri::command]
fn default_browser() -> Option<String> {
    read_default_browser()
}

/// Windows keeps the program chosen for https links under the user's own settings. Newer builds
/// of Windows 11 write the choice to `UserChoiceLatest`, and may leave an older choice behind in
/// `UserChoice`, so the newer key is read first.
#[cfg(windows)]
fn read_default_browser() -> Option<String> {
    use winreg::{
        enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER},
        RegKey,
    };
    const CHOICES: [&str; 2] = [
        "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoiceLatest\\ProgId",
        "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
    ];
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let prog_id = CHOICES.iter().find_map(|place| {
        let id: String = user.open_subkey(place).ok()?.get_value("ProgId").ok()?;
        let id = id.trim().to_string();
        (!id.is_empty()).then_some(id)
    })?;
    if let Some(name) = browser_name(&prog_id) {
        return Some(name.into());
    }
    // Any other browser names itself where it registers its links. A name that begins with `@` is
    // a pointer into a program's resources, not a name, so it is left alone.
    let name: String = RegKey::predef(HKEY_CLASSES_ROOT)
        .open_subkey(format!("{prog_id}\\Application"))
        .ok()?
        .get_value("ApplicationName")
        .ok()?;
    let name = name.trim();
    (!name.is_empty() && !name.starts_with('@')).then(|| name.to_string())
}

#[cfg(not(windows))]
fn read_default_browser() -> Option<String> {
    None
}

/// The name of a well-known browser, from the program ID Windows records for it. Most IDs begin
/// with a fixed word and may carry a suffix that differs from one installation to the next.
fn browser_name(prog_id: &str) -> Option<&'static str> {
    const KNOWN: [(&str, &str); 10] = [
        ("ChromeHTML", "Chrome"),
        ("MSEdgeHTM", "Microsoft Edge"),
        // The Edge that came with Windows 10 before the present one, by its store package's ID.
        ("AppXq0fevzme2pys62n3e0fbqa7peapykr8v", "Microsoft Edge"),
        ("FirefoxURL", "Firefox"),
        ("BraveHTML", "Brave"),
        ("OperaGX", "Opera GX"),
        ("Opera", "Opera"),
        ("VivaldiHTM", "Vivaldi"),
        ("ArcHTML", "Arc"),
        ("IE.HTTP", "Internet Explorer"),
    ];
    let id = prog_id.to_ascii_lowercase();
    KNOWN
        .iter()
        .find(|(start, _)| id.starts_with(&start.to_ascii_lowercase()))
        .map(|(_, name)| *name)
}

/// The site this talks to. A developer can point it at a local or preview copy of the site with
/// WIDSITH_SERVER; anything that isn't one of those is ignored. A build made to be handed out
/// (the `public` feature, which `npm run release` sets) ignores the variable altogether, and its
/// allow-list (capabilities/release.json) admits the real site alone.
#[tauri::command]
fn server_url() -> String {
    if cfg!(feature = "public") {
        return DEFAULT_SERVER.into();
    }
    let Ok(wanted) = std::env::var("WIDSITH_SERVER") else {
        return DEFAULT_SERVER.into();
    };
    let wanted = wanted.trim().trim_end_matches('/').to_string();
    if is_local(&wanted) || is_preview(&wanted) {
        wanted
    } else {
        DEFAULT_SERVER.into()
    }
}

/// `http://localhost` or `http://localhost:<port>`, and nothing more.
fn is_local(address: &str) -> bool {
    match address.strip_prefix("http://localhost") {
        Some("") => true,
        Some(rest) => rest
            .strip_prefix(':')
            .is_some_and(|port| !port.is_empty() && port.chars().all(|c| c.is_ascii_digit())),
        None => false,
    }
}

/// `https://<name>.vercel.app`, the name plain letters, digits, dots and dashes.
fn is_preview(address: &str) -> bool {
    address.strip_prefix("https://").is_some_and(|host| {
        host.ends_with(".vercel.app")
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
    })
}

// ---- Updating itself ----------------------------------------------------------------------------

/// Whether this build looks for a newer version of itself. A build being worked on (`npm run
/// dev`) looks only when WIDSITH_SERVER points it at a copy of the site, so it never asks the real
/// one; every other build looks at the site it talks to.
fn looks_for_updates() -> bool {
    !cfg!(debug_assertions) || std::env::var_os("WIDSITH_SERVER").is_some()
}

/// The update found by the last check, and its installer once downloaded and its signature
/// checked against the key in tauri.conf.json.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<(Update, Option<Vec<u8>>)>>);

#[derive(Serialize)]
struct UpdateFound {
    version: String,
    notes: Option<String>,
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    done: u64,
    total: Option<u64>,
}

/// Asks the site's update feed whether there is a newer version than this one. None when there
/// isn't, or when this build doesn't look.
#[tauri::command]
async fn update_check(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateFound>, String> {
    if !looks_for_updates() {
        return Ok(None);
    }
    let feed = Url::parse(&format!("{}{UPDATE_FEED}", server_url())).map_err(|e| e.to_string())?;
    let found = app
        .updater_builder()
        .endpoints(vec![feed])
        .and_then(|builder| builder.build())
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let mut slot = pending.0.lock().await;
    let Some(update) = found else {
        *slot = None;
        return Ok(None);
    };
    let answer = UpdateFound {
        version: update.version.clone(),
        notes: update.body.clone(),
    };
    // The same version found again keeps its download.
    if slot.as_ref().map(|(kept, _)| &kept.version) != Some(&update.version) {
        *slot = Some((update, None));
    }
    Ok(Some(answer))
}

/// Downloads the update found by the last check and checks its signature, telling the window how
/// far it has got with `update-progress` events.
#[tauri::command]
async fn update_download(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .await
        .as_ref()
        .map(|(update, _)| update.clone())
        .ok_or("No update has been found to download.")?;
    let mut done: u64 = 0;
    let mut said: u64 = 0;
    let bytes = update
        .download(
            |chunk, total| {
                done += chunk as u64;
                // Said every 64 KB and at the end, not for every piece the network hands over.
                if done - said >= 64 * 1024 || Some(done) == total {
                    said = done;
                    let _ = app.emit("update-progress", UpdateProgress { done, total });
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut slot = pending.0.lock().await;
    if let Some((kept, installer)) = slot.as_mut() {
        if kept.version == update.version {
            *installer = Some(bytes);
        }
    }
    Ok(())
}

/// What the app leaves itself before installing an update: whether to show its window when it
/// starts again. The installer starts it with the arguments it was first started with, which
/// can't say whether the player asked for the update (and wants the window back) or the app
/// updated by itself while nobody was using it (and should stay in the tray).
#[derive(Serialize, Deserialize)]
struct AfterUpdate {
    show: bool,
    /// When the note was left, seconds since the epoch.
    at: u64,
}

fn seconds_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

fn after_update_file(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_config_dir().ok()?.join(AFTER_UPDATE_FILE))
}

/// Whether to show the window on starting again after an update, from the note left before it;
/// None when there is no fresh note. The note is read once and thrown away.
fn take_after_update(app: &AppHandle) -> Option<bool> {
    let file = after_update_file(app)?;
    let text = fs::read_to_string(&file).ok()?;
    let _ = fs::remove_file(&file);
    shows_after_update(&text, seconds_now())
}

/// What a note left before an update says, if it is fresh at `now` (seconds since the epoch).
fn shows_after_update(text: &str, now: u64) -> Option<bool> {
    let note: AfterUpdate = serde_json::from_str(text).ok()?;
    let age = now.saturating_sub(note.at);
    (age < AFTER_UPDATE_FRESH.as_secs()).then_some(note.show)
}

/// Installs the downloaded update. On Windows this starts the installer, which needs no answer
/// from the player, and the app ends at once; the installer starts the new version when it has
/// finished. Elsewhere the new version is put in place and the app starts it itself. `show`:
/// whether the new version shows its window, as when the player asked for the update.
#[tauri::command]
async fn update_install(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    show: bool,
) -> Result<(), String> {
    let slot = pending.0.lock().await;
    let Some((update, Some(installer))) = slot.as_ref() else {
        return Err("The update hasn't been downloaded yet.".into());
    };
    let note = after_update_file(&app);
    if let Some(note) = &note {
        let text = serde_json::to_string(&AfterUpdate {
            show,
            at: seconds_now(),
        })
        .map_err(|e| e.to_string())?;
        let _ = fs::write(note, text);
    }
    if let Err(error) = update.install(installer) {
        if let Some(note) = &note {
            let _ = fs::remove_file(note);
        }
        return Err(error.to_string());
    }
    app.restart()
}

// ---- The window and the tray --------------------------------------------------------------------

fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The tray menu's pause item, kept so its words can follow whether uploading is paused.
struct PauseItem(MenuItem<Wry>);

/// The tray's word for what its pause item will do.
fn pause_label(paused: bool) -> &'static str {
    if paused {
        "Resume uploading"
    } else {
        "Pause uploading"
    }
}

/// Shows in the tray whether uploading is paused: the menu item's words, the picture (the flame
/// lit, or put out) and the name under the pointer. The window keeps the setting and calls this
/// whenever it changes, and once when it starts; the tray only asks the window to change it.
#[tauri::command]
async fn set_paused(
    app: AppHandle,
    item: State<'_, PauseItem>,
    paused: bool,
) -> Result<(), String> {
    item.0
        .set_text(pause_label(paused))
        .map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id("main") {
        let picture = if paused { TRAY_PAUSED_ICON } else { TRAY_ICON };
        if let Ok(icon) = Image::from_bytes(picture) {
            tray.set_icon(Some(icon))
                .map_err(|error| error.to_string())?;
        }
        let tooltip = if paused {
            format!("{TRAY_TOOLTIP} (paused)")
        } else {
            TRAY_TOOLTIP.to_string()
        };
        tray.set_tooltip(Some(tooltip))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // A second launch brings the first one's window forward instead of starting again.
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _folder| show(app),
        ))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            find_installs,
            as_install,
            scan_recordings,
            read_recording,
            addon_versions,
            secret_get,
            secret_set,
            secret_clear,
            state_load,
            state_save,
            computer_name,
            default_browser,
            open_taskbar_settings,
            server_url,
            set_paused,
            update_check,
            update_download,
            update_install
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Widsith Uploader", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", pause_label(false), true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pause, &quit])?;
            app.manage(PauseItem(pause));
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip(TRAY_TOOLTIP)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    // The window keeps whether uploading is paused: it is asked to turn it over,
                    // and answers through set_paused.
                    "pause" => {
                        let _ = app.emit("toggle-pause", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show(tray.app_handle());
                    }
                });
            match Image::from_bytes(TRAY_ICON) {
                Ok(icon) => tray = tray.icon(icon),
                Err(_) => {
                    if let Some(icon) = app.default_window_icon() {
                        tray = tray.icon(icon.clone());
                    }
                }
            }
            tray.build(app)?;

            // The app's clock: a timer inside a hidden window is slowed by the system, this isn't.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(TICK);
                let _ = handle.emit("tick", ());
            });

            // Started with Windows it stays in the tray; started by hand it shows its window. Started
            // again by an update, it does as the note it left itself says.
            let shown = take_after_update(app.handle())
                .unwrap_or_else(|| !std::env::args().any(|argument| argument == "--hidden"));
            if shown {
                show(app.handle());
            }
            Ok(())
        })
        // Closing the window leaves the app in the tray, where it goes on sending.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Widsith Uploader couldn't start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_recording_is_a_recording() {
        for good in [
            "E:\\World of Warcraft\\_retail_\\WTF\\Account\\ACCT\\Kirin Tor\\Sarovin\\SavedVariables\\Widsith.lua",
            "E:\\World of Warcraft\\_retail_\\WTF\\Account\\ACCT\\Kirin Tor\\Sarovin\\SavedVariables\\WoWJourney.lua",
        ] {
            assert!(is_recording_path(Path::new(good)), "{good}");
            assert!(is_recording_path(Path::new(&good.to_lowercase())), "{good}");
        }
        for bad in [
            "E:\\World of Warcraft\\_retail_\\WTF\\Account\\ACCT\\Kirin Tor\\Sarovin\\SavedVariables\\Other.lua",
            "E:\\World of Warcraft\\_retail_\\WTF\\Account\\ACCT\\SavedVariables\\WoWJourney.lua",
            "E:\\World of Warcraft\\_retail_\\WTF\\Config.wtf",
            "C:\\Users\\someone\\Documents\\WoWJourney.lua",
            "C:\\Users\\someone\\Documents\\Widsith.lua",
            "E:\\Games\\retail\\WTF\\Account\\ACCT\\Realm\\Name\\SavedVariables\\WoWJourney.lua",
            "E:\\World of Warcraft\\_retail_\\WTF\\Account\\ACCT\\Realm\\..\\SavedVariables\\WoWJourney.lua",
        ] {
            assert!(!is_recording_path(Path::new(bad)), "{bad}");
        }
    }

    #[test]
    fn the_tray_picture_is_a_picture() {
        let icon = Image::from_bytes(TRAY_ICON).expect("icons/tray.png should be a PNG");
        assert_eq!((icon.width(), icon.height()), (32, 32));
    }

    #[test]
    fn the_paused_tray_picture_is_a_picture() {
        let icon =
            Image::from_bytes(TRAY_PAUSED_ICON).expect("icons/tray-paused.png should be a PNG");
        assert_eq!((icon.width(), icon.height()), (32, 32));
        assert_ne!(TRAY_PAUSED_ICON, TRAY_ICON);
    }

    #[test]
    fn a_well_known_browser_is_called_by_its_name() {
        for (prog_id, name) in [
            ("ChromeHTML", "Chrome"),
            ("ChromeHTML.ABCDEFGHIJKLMNOP", "Chrome"),
            ("MSEdgeHTM", "Microsoft Edge"),
            ("AppXq0fevzme2pys62n3e0fbqa7peapykr8v", "Microsoft Edge"),
            ("FirefoxURL-308046B0AF4A39CB", "Firefox"),
            ("BraveHTML", "Brave"),
            ("OperaStable", "Opera"),
            ("Opera", "Opera"),
            ("OperaGXStable", "Opera GX"),
            ("VivaldiHTM.4BTNDIRKSXZGBOJ2Z5S2VTLDLU", "Vivaldi"),
            ("ArcHTML", "Arc"),
            ("IE.HTTP", "Internet Explorer"),
            ("IE.HTTPS", "Internet Explorer"),
            ("chromehtml", "Chrome"),
        ] {
            assert_eq!(browser_name(prog_id), Some(name), "{prog_id}");
        }
        for unknown in ["", "SomeOtherBrowserURL", "HTML", "Chrome"] {
            assert_eq!(browser_name(unknown), None, "{unknown}");
        }
    }

    #[test]
    fn the_pause_item_says_what_it_will_do() {
        assert_eq!(pause_label(false), "Pause uploading");
        assert_eq!(pause_label(true), "Resume uploading");
    }

    #[test]
    fn the_note_left_before_an_update_counts_only_while_fresh() {
        let note = |show: bool, at: u64| serde_json::to_string(&AfterUpdate { show, at }).unwrap();
        let now = 1_800_000_000;
        assert_eq!(shows_after_update(&note(true, now - 60), now), Some(true));
        assert_eq!(shows_after_update(&note(false, now - 60), now), Some(false));
        assert_eq!(shows_after_update(&note(true, now - 3600), now), None);
        assert_eq!(shows_after_update("not a note", now), None);
    }

    #[test]
    fn work_that_panics_gives_the_failed_answer() {
        let answer = tauri::async_runtime::block_on(off_main(
            || -> Vec<String> { panic!("a drive went away") },
            Vec::new(),
        ));
        assert!(answer.is_empty());
        let answer = tauri::async_runtime::block_on(off_main(|| vec![1], Vec::new()));
        assert_eq!(answer, vec![1]);
    }

    #[cfg(windows)]
    #[test]
    fn the_system_drive_is_not_a_network_drive() {
        let system = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        assert!(!is_network_drive(Path::new(&format!("{system}\\"))));
    }

    #[test]
    fn a_game_folder_is_named_between_underscores() {
        assert!(is_flavor("_retail_"));
        assert!(is_flavor("_classic_era_"));
        assert!(!is_flavor("Data"));
        assert!(!is_flavor("__"));
    }

    #[cfg(feature = "public")]
    #[test]
    fn a_build_handed_out_talks_to_the_real_site_whatever_is_set() {
        std::env::set_var("WIDSITH_SERVER", "http://localhost:5188");
        assert_eq!(server_url(), DEFAULT_SERVER);
        std::env::remove_var("WIDSITH_SERVER");
    }

    #[cfg(not(feature = "public"))]
    #[test]
    fn the_site_can_only_be_swapped_for_a_local_or_preview_copy() {
        std::env::remove_var("WIDSITH_SERVER");
        assert_eq!(server_url(), DEFAULT_SERVER);
        for (wanted, expected) in [
            ("http://localhost:5188", "http://localhost:5188"),
            ("http://localhost:5188/", "http://localhost:5188"),
            (
                "https://widsith-web-git-x-reflective-grove.vercel.app",
                "https://widsith-web-git-x-reflective-grove.vercel.app",
            ),
            ("https://example.com", DEFAULT_SERVER),
            ("http://localhost.evil.com", DEFAULT_SERVER),
            ("http://localhost:5188/x@evil.com", DEFAULT_SERVER),
            ("https://evil.com/.vercel.app", DEFAULT_SERVER),
            ("http://192.168.1.4:5188", DEFAULT_SERVER),
            ("http://localhost:5188@evil.com", DEFAULT_SERVER),
            ("https://user@evil.com#.vercel.app", DEFAULT_SERVER),
            ("https://evil.com?.vercel.app", DEFAULT_SERVER),
        ] {
            std::env::set_var("WIDSITH_SERVER", wanted);
            assert_eq!(server_url(), expected, "{wanted}");
        }
        std::env::remove_var("WIDSITH_SERVER");
    }
}
