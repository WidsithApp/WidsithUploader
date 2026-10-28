// The real computer: everything the engine asks of its host, answered by the app's own small
// commands (src-tauri/src/main.rs) and by Tauri's plugins. The window has no way to read a file or
// reach the network on its own. Files come only through `read_recording`, which opens nothing
// but a recording, and requests go only through the HTTP plugin, which is allowed one site. The
// one exception is the app's own update, which the Rust side fetches from the same site.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { fetch as siteFetch } from '@tauri-apps/plugin-http';
import {
	isPermissionGranted,
	requestPermission,
	sendNotification
} from '@tauri-apps/plugin-notification';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { AddonFound, FoundFile, Host, Updates } from '../core/engine.ts';

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha256(text: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The app's own updates, fetched and checked against the app's signing key on the Rust side
 * (`update_*`), so the window never handles the installer.
 */
const updates: Updates = {
	check: () => invoke<{ version: string; notes: string | null } | null>('update_check'),
	async download(onProgress) {
		const stop = await listen<{ done: number; total: number | null }>(
			'update-progress',
			(event) => onProgress(event.payload.done, event.payload.total)
		);
		try {
			await invoke<void>('update_download');
		} finally {
			stop();
		}
	},
	install: (show) => invoke<void>('update_install', { show })
};

async function notify(title: string, body: string): Promise<void> {
	let granted = await isPermissionGranted();
	if (!granted) granted = (await requestPermission()) === 'granted';
	if (granted) sendNotification({ title, body });
}

export async function tauriHost(): Promise<Host> {
	const server = await invoke<string>('server_url');
	return {
		server,
		fetch: (url, init) => siteFetch(url, init),
		tools: { gzip, sha256 },
		findInstalls: () => invoke<string[]>('find_installs'),
		scan: (root) => invoke<FoundFile[]>('scan_recordings', { root }),
		// The file's bytes, read as a browser reads a dropped file, so both give the same text.
		read: async (path) =>
			new TextDecoder().decode(await invoke<ArrayBuffer>('read_recording', { path })),
		addons: (root) => invoke<AddonFound[]>('addon_versions', { root }),
		// One entry per link in the system's credential store, by the key the engine gives (the
		// site's address, and the account's Battle.net ID for a link made since accounts were told
		// apart).
		secret: {
			get: (key) => invoke<string | null>('secret_get', { key }),
			set: (key, value) => invoke<void>('secret_set', { key, value }),
			clear: (key) => invoke<void>('secret_clear', { key })
		},
		loadState: () => invoke<string | null>('state_load'),
		saveState: (json) => invoke<void>('state_save', { json }),
		computerName: () => invoke<string>('computer_name'),
		open: (url) => openUrl(url),
		notify,
		now: () => Date.now(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		browser: () => invoke<string | null>('default_browser'),
		updates
	};
}

/** Shows in the tray whether uploading is paused: its menu's words and its picture. */
export function showPaused(paused: boolean): Promise<void> {
	return invoke<void>('set_paused', { paused });
}

/** The game folder a picked folder belongs to, or null if it isn't one. */
export function asInstall(path: string): Promise<string | null> {
	return invoke<string | null>('as_install', { path });
}

/** Opens Windows' taskbar settings, where the app's tray icon can be kept in view. */
export function openTaskbarSettings(): Promise<void> {
	return invoke<void>('open_taskbar_settings');
}
