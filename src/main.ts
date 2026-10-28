import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import './app.css';
import { mount } from 'svelte';
import App from './ui/App.svelte';
import type { Controller, Shell } from './ui/controller.ts';

/** Puts text on the clipboard: the modern way, then the old one if that is refused. */
async function copy(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const field = document.createElement('textarea');
		field.value = text;
		field.style.position = 'fixed';
		field.style.opacity = '0';
		document.body.append(field);
		field.select();
		const done = document.execCommand('copy');
		field.remove();
		return done;
	}
}

/** Inside the app, or opened in an ordinary browser to be looked at. */
const inApp = '__TAURI_INTERNALS__' in window;

async function real(): Promise<{ controller: Controller; shell: Shell }> {
	const [
		{ Engine },
		{ tauriHost, asInstall, openTaskbarSettings, showPaused },
		{ listen },
		autostart,
		{ open }
	] = await Promise.all(
		[
			import('./core/engine.ts'),
			import('./host/tauri.ts'),
			import('@tauri-apps/api/event'),
			import('@tauri-apps/plugin-autostart'),
			import('@tauri-apps/plugin-dialog')
		]
	);
	const host = await tauriHost();
	const engine = new Engine(host);
	// The app's own clock ticks it (a timer in a hidden window is slowed by the system), and the
	// tray's pause item asks for uploading to be paused or resumed.
	await listen('tick', () => void engine.tick());
	await listen('toggle-pause', () => void engine.setPaused(!engine.view.paused));
	// The engine keeps whether uploading is paused; the tray shows it, from the start and on
	// every change.
	let shownPaused: boolean | null = null;
	engine.subscribe((view) => {
		if (view.paused === shownPaused) return;
		shownPaused = view.paused;
		void showPaused(view.paused).catch(() => {});
	});
	void engine.start();
	return {
		controller: engine,
		shell: {
			server: host.server,
			open: (url) => void host.open(url).catch(() => {}),
			copy,
			async pickFolder() {
				const picked = await open({
					directory: true,
					title: 'Choose your World of Warcraft folder'
				});
				if (typeof picked !== 'string') return { root: null, picked: false };
				return { root: await asInstall(picked), picked: true };
			},
			startsWithWindows: () => autostart.isEnabled().catch(() => false),
			setStartsWithWindows: (on) => (on ? autostart.enable() : autostart.disable()),
			openTaskbarSettings: () => void openTaskbarSettings().catch(() => {})
		}
	};
}

const { controller, shell } = inApp ? await real() : (await import('./ui/demo.ts')).demo();

mount(App, { target: document.getElementById('app')!, props: { controller, shell } });
