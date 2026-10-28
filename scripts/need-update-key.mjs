// Run before a release build. A release is signed for the app's own updater, so that copies already
// installed accept it as an update, and the build needs the update signing key to do it. Without
// the key this stops the build at once and says what to set, rather than failing late in the
// bundler or producing an installer that can't be offered as an update.

const key = process.env.TAURI_SIGNING_PRIVATE_KEY;

if (!key || !key.trim()) {
	console.error(`A release build signs the app for its updater, and needs the update signing key.

Set TAURI_SIGNING_PRIVATE_KEY to the key file's path or to its contents, then build again.
In PowerShell:

    $env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\\.tauri\\widsith-uploader.key"

The README's "Self-update" section says where the key is kept.`);
	process.exit(1);
}
