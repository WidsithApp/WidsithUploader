// What the window needs of the app behind it. The engine is one; so is the stand-in that lets the
// window be opened in an ordinary browser to look at (demo.ts).

import type { View } from '../core/engine.ts';

export interface Controller {
	subscribe(listener: (view: View) => void): () => void;
	/** `open`: open the linking page in the default browser (the default), or leave that to the player. */
	link(open?: boolean): Promise<void>;
	reopenLink(): Promise<void>;
	cancelLink(): void;
	/** Gives up an account's link; the one link's when `id` isn't said. */
	unlink(id?: string): Promise<void>;
	/**
	 * Switches uploading on or off for one character, by its file. On again, one removed on the
	 * site comes back whole; off, it is never sent.
	 */
	setUploading(path: string, on: boolean): Promise<void>;
	addRoot(root: string): Promise<void>;
	removeRoot(root: string): Promise<void>;
	sendNow(): Promise<void>;
	/**
	 * Pauses uploading, or resumes it. While paused, recordings are still read and shown, and the
	 * switches still turn, but nothing is sent and the site isn't asked. Resuming sends what is
	 * owed at once.
	 */
	setPaused(on: boolean): Promise<void>;
	/**
	 * Starts uploading for an account, once, after linking: its characters on this computer are
	 * kept Private from now on, but for those switched off. For the account named, or the one whose
	 * start is up.
	 */
	beginUploading(id?: string): Promise<void>;
	/** The player has the window in front of them: what was new since they last looked is seen. */
	looked(): Promise<void>;
	/** The window was hidden again. */
	left(): void;
	/**
	 * Installs the downloaded newer version of the app and starts it, once nothing is being sent.
	 * The app ends and the new version opens its window.
	 */
	installUpdate(): Promise<void>;
}

/** What the window asks of the computer directly. */
export interface Shell {
	/** The site's address, for links to it. */
	server: string;
	open(url: string): void;
	/** Puts text on the clipboard; false if the system wouldn't allow it. */
	copy(text: string): Promise<boolean>;
	/** Asks the player for a game folder; null if they picked none, or not one. */
	pickFolder(): Promise<{ root: string | null; picked: boolean }>;
	startsWithWindows(): Promise<boolean>;
	setStartsWithWindows(on: boolean): Promise<void>;
	/**
	 * Opens Windows' taskbar settings. Windows decides which tray icons show beside the clock and
	 * no app may promote its own, so the window can only send the player there.
	 */
	openTaskbarSettings(): void;
}
