// The uploader's behaviour, with nothing of Windows or the window in it: find the game's folders,
// notice each character's recording, read it when it changes, and send it once its player has said
// how it is kept. Everything outside comes through `Host`, so the tests run it against a made-up
// computer and site.
//
// A computer can hold several Battle.net accounts, each with its own recordings folder. A link is
// to an account, not the computer: the site says which account approved it, and that token sends
// only that account's folders. An unlinked account's folder sends nothing.
//
// Rules:
//   - Nothing is sent for an account until its player has started uploading, after linking, with
//     the characters in front of them and the chance to leave any out.
//   - A character switched off here is never sent.
//   - A character removed on the site is not sent again until it is switched back on here; the
//     site's list of removals is the authority, not this computer's memory.
//   - A character the app sends is kept Private. Public is chosen on the site.
//
// Notifications only when the player has something to do, never twice for the same thing. Paused,
// it keeps looking and reading so the window stays current, but sends and asks nothing.
//
// Updates: a newer version is fetched when the site offers one and installed when the player asks,
// or after the app has been idle for a while, never during a send.
import { Api, Unlinked, type Fetch, type Me, type Sharing } from './api.ts';
import { APP_NAME, EARLIER_RECORDING_FILE, SITE_NAME, TIMING } from './config.ts';
import {
	asEarlier,
	NotARecording,
	ownSessions,
	splitRecording,
	type Game,
	type SplitFile
} from './sessions.ts';
import { syncRecording, type SyncTools } from './sync.ts';
import { flavorName, isOlder } from './version.ts';

/** Whether a found file is one the addon wrote under its earlier name, by the end of its path. */
export function isEarlierFile(path: string): boolean {
	const name = path.split(/[\\/]/).pop() ?? '';
	return name.toLowerCase() === EARLIER_RECORDING_FILE.toLowerCase();
}

/**
 * The Battle.net account an account folder belongs to: the game names the folder by the
 * account's ID and a licence number, `12345678#1`. An install from before the game did so has a
 * name in capitals instead, which says nothing of whose it is: null.
 */
export function accountIdOf(folder: string): string | null {
	return /^(\d+)#\d+$/.exec(folder)?.[1] ?? null;
}

/** A recording file found in a game folder. */
export interface FoundFile {
	path: string;
	/** The game folder it is under: `_retail_`, `_classic_era_`… */
	flavor: string;
	/** The account folder it is under, as the game names it. */
	account: string;
	/** Its realm and character folders, for a name until the file is read. */
	realm: string;
	character: string;
	/** When it was last written, ms since the epoch, and its size in bytes. */
	modified: number;
	size: number;
}

/** The addon as installed in one game folder. */
export interface AddonFound {
	flavor: string;
	version: string | null;
}

/** The computer, as the engine sees it. */
export interface Host {
	readonly server: string;
	fetch: Fetch;
	tools: SyncTools;
	/** Folders that hold World of Warcraft. */
	findInstalls(): Promise<string[]>;
	/** Every recording file under one of them. */
	scan(root: string): Promise<FoundFile[]>;
	/** A recording file's text. */
	read(path: string): Promise<string>;
	/** Where the addon is installed under one of them, and which version. */
	addons(root: string): Promise<AddonFound[]>;
	/**
	 * The tokens, kept by the system's credential store, one per key: the site's address alone
	 * for a link made before accounts were told apart, else the address and the account's ID.
	 */
	secret: {
		get(key: string): Promise<string | null>;
		set(key: string, value: string): Promise<void>;
		clear(key: string): Promise<void>;
	};
	loadState(): Promise<string | null>;
	saveState(json: string): Promise<void>;
	computerName(): Promise<string>;
	open(url: string): Promise<void>;
	notify(title: string, body: string): Promise<void>;
	now(): number;
	sleep(ms: number): Promise<void>;
	/** What to call the browser web links open in ("Chrome"), or null when it can't be told. */
	browser?(): Promise<string | null>;
	/** Newer versions of the app itself, where the computer can fetch and install them. */
	updates?: Updates;
}

/** The app's own updates, as the computer fetches and installs them. */
export interface Updates {
	/** A newer version than this one, from the site's update feed; null when there is none. */
	check(): Promise<{ version: string; notes: string | null } | null>;
	/** Fetches the version the last check found, and checks its signature. */
	download(onProgress: (done: number, total: number | null) => void): Promise<void>;
	/**
	 * Installs what was fetched and starts the new version, which ends this one. `show`: whether
	 * the new version shows its window, as it should when the player asked for the update.
	 */
	install(show: boolean): Promise<void>;
}

/**
 * A newer version of the app, from being found to going in. It is downloaded as soon as it is
 * found, so there is no state between the two.
 */
export interface UpdateView {
	version: string;
	notes: string | null;
	state: 'downloading' | 'ready' | 'installing' | 'failed';
	/** How much of it has been fetched, from 0 to 1, while that can be told. */
	progress: number | null;
	/** Why it failed, when it did. */
	message: string | null;
}

/** How far a character's sessions in a file have been sent. */
interface Sending {
	/** The file's `modified` as it was when everything of the character's in it had been sent. */
	sentModified: number | null;
	sentAt: number | null;
	/** Sessions were sent but the site never finished reading them. */
	owesDone?: boolean;
	/**
	 * Sessions the site called too large to take, by start time, with the text length each had
	 * then. Left out of every later sending until one has grown, which only an open session can;
	 * the card says so. Missing when there are none.
	 */
	tooLarge?: Record<string, number>;
}

/**
 * An earlier character in a file: one deleted in the game, whose name and realm a newer character
 * took, so that the newer one's file still holds its sessions. It is a character of its own, sent
 * under its own GUID or not at all.
 */
interface EarlierRecord extends Sending {
	sessions: number;
	game: Game | null;
	/** When its last session in the file began, in ms. */
	lastStartedAt: number | null;
}

interface FileRecord extends Sending {
	modified: number;
	size: number;
	guid: string | null;
	name: string | null;
	realm: string | null;
	/** The sessions that are the character's own, not an earlier character's. */
	sessions: number;
	/**
	 * The earlier characters in the file, by GUID. Missing from a file read by an earlier version
	 * of the app, which is read again for them.
	 */
	earlier?: Record<string, EarlierRecord>;
	/**
	 * What the recording says of its character and game. Missing from a file read by an earlier
	 * version of the app, which is read again for them.
	 */
	classID?: number | null;
	raceID?: number | null;
	region?: number | null;
	game?: Game | null;
	/** Why it couldn't be read, when it couldn't. */
	unreadable?: string;
}

/**
 * One row of the window: a file's character, or an earlier character in that file. `former` is
 * the earlier character's GUID, for the second kind.
 */
interface Row {
	key: string;
	file: FoundFile;
	former: string | null;
}

/** One link: an account on the site, with what this computer remembers of it. */
interface Link {
	/** Who it is, for the heading before the site answers. */
	battletag: string | null;
	/** The player has started uploading for this account, once, after linking. */
	started: boolean;
}

interface Persisted {
	version: 5;
	/** Game folders the player pointed at by hand. */
	manualRoots: string[];
	/** Characters switched off here, by GUID: never sent. */
	skipped: string[];
	/**
	 * Earlier characters the player switched on, by GUID. An earlier character the site doesn't
	 * keep is off until it is switched on: the player decides whether it becomes a character of
	 * its own there. One the site keeps already (it was sent before it was deleted) is on, as it
	 * was. Missing from a file written before version 5, which reads as none.
	 */
	earlierOn: string[];
	/**
	 * Characters the site said their player removed there, by GUID, with when (ms), or null when
	 * it didn't say. Never sent again until the player switches the character back on.
	 */
	removed: Record<string, number | null>;
	/**
	 * Characters switched back on after they were removed, by GUID: their next sending is the
	 * player's own choice, so the sessions they deleted come back with it.
	 */
	restored: string[];
	files: Record<string, FileRecord>;
	/** The links, by the account's Battle.net ID. */
	links: Record<string, Link>;
	/**
	 * A link made before accounts were told apart, whose token is kept under the site's address
	 * alone: what was remembered of it, until the site says which account it is for.
	 */
	pendingLink: Link | null;
	/** When each character was first seen in a recording on this computer, by GUID, in ms. */
	firstSeen: Record<string, number>;
	/** When each account was first seen on this computer, by its ID, in ms. */
	accountsSeen: Record<string, number>;
	/** The notifications already sent, so none is sent twice. */
	told: string[];
	/** When the player last had the window in front of them. */
	lookedAt: number | null;
	/**
	 * The player paused uploading: recordings are still looked at and read, but nothing is sent,
	 * the site isn't asked, and nothing is notified. Missing from a file written before there was
	 * a pause, which reads as not paused.
	 */
	paused: boolean;
}

const EMPTY: Persisted = {
	version: 5,
	manualRoots: [],
	skipped: [],
	earlierOn: [],
	removed: {},
	restored: [],
	files: {},
	links: {},
	pendingLink: null,
	firstSeen: {},
	accountsSeen: {},
	told: [],
	lookedAt: null,
	paused: false
};

/** What the card says of sessions the site won't take for their size; null when there are none. */
function tooLargeNote(sending: Sending | null): string | null {
	const n = Object.keys(sending?.tooLarge ?? {}).length;
	if (n === 0) return null;
	return n === 1
		? `One session is too large for ${SITE_NAME} to take and stays on this PC. Everything else is sent.`
		: `${n} sessions are too large for ${SITE_NAME} to take and stay on this PC. Everything else is sent.`;
}

/** The games' names, for a character the site doesn't keep yet. */
const GAME_LABELS: Record<Game, string> = {
	forever: 'WoW Forever',
	retail: 'Retail',
	classic: 'Classic'
};

export type CharacterStatus =
	/** Found, not read yet. */
	| 'reading'
	| 'unreadable'
	/** Its account isn't linked, so nothing is asked or sent. */
	| 'unlinked'
	/** Linked, but the site hasn't said what the account keeps. */
	| 'waiting'
	/** Linked, but the player hasn't started uploading for the account yet. */
	| 'unstarted'
	/** Not kept yet, and on its way: sent as Private at the next look. */
	| 'new'
	/** Switched off here: never sent. */
	| 'skipped'
	/** Its player removed it on the site: not sent again until switched back on. */
	| 'removed'
	/** The site turned it away, for a reason in `message`. Tried again now and then. */
	| 'refused'
	| 'sending'
	| 'kept';

export interface CharacterView {
	/**
	 * The file's path for the character the file is named for; the path, `#` and the GUID for an
	 * earlier character in it.
	 */
	key: string;
	guid: string | null;
	/** As the site names it when it keeps the character (in full on WoW Forever), else the file. */
	name: string;
	realm: string | null;
	flavor: string;
	/** The Battle.net account its folder belongs to; null for a folder that doesn't say. */
	account: string | null;
	/** A file the addon wrote under its earlier name: it doesn't grow any more. */
	earlier: boolean;
	/**
	 * An earlier character of the same name and realm, deleted in the game, whose sessions are
	 * still in the newer character's file. Off until switched on, unless the site keeps it already.
	 */
	former: boolean;
	sessions: number;
	status: CharacterStatus;
	sharing: Sharing | null;
	/** Whether everything in the file has been sent. */
	upToDate: boolean;
	progress: { sent: number; total: number } | null;
	sentAt: number | null;
	/** When its player removed it on the site, in ms, when the site said. */
	removedAt: number | null;
	/** Something the player should know about this character. */
	message: string | null;
	/** Its page on the site, the whole address, once it is kept. */
	pageUrl: string | null;
	/**
	 * Whether Battle.net lists it on the account, as the site says; null when the site doesn't keep
	 * it or didn't say.
	 */
	verified: boolean | null;
	classID: number | null;
	raceID: number | null;
	/** The race's name, when the site keeps the character. */
	race: string | null;
	/** The region its realm is in, by the number the recording gives. */
	region: number | null;
	/** The site's figures, when it keeps the character. Times in ms. */
	level: number | null;
	playedMs: number | null;
	/** The game's own /played at the end of what the site keeps, in ms. */
	gamePlayedMs: number | null;
	lastPlayedMs: number | null;
	sittings: number | null;
	/**
	 * When the game last wrote its recording, in ms: when it was last played as far as this
	 * computer can tell, for a character the site doesn't keep. For an earlier character, when its
	 * last session in the file began, since the file has been written by the newer one since.
	 */
	savedAt: number;
	/** The game, as the site says when it keeps the character, else as the recording says. */
	game: Game | null;
	/** What to call the game on its card. */
	gameLabel: string;
	/** The class's icon, when the site has said where they are. */
	classIcon: string | null;
	/** When it was first seen in a recording on this computer, in ms. */
	firstSeen: number | null;
	/** First seen since the player last looked. */
	isNew: boolean;
	/** Its last send finished since the player last looked. */
	sentSinceLooked: boolean;
}

/** An account with recordings on this computer. */
export interface AccountView {
	/** Its Battle.net ID; null for the folders that don't say whose they are. */
	id: string | null;
	linked: boolean;
	battletag: string | null;
	/** Linked, and the player has started uploading for it. */
	started: boolean;
	/** When any of its recordings was last written, in ms. */
	lastPlayedAt: number | null;
	characters: number;
	/** First seen since the player last looked, or holding a character that is new. */
	isNew: boolean;
	/** Something in it was sent since the player last looked. */
	sentSinceLooked: boolean;
	/** Linked, and the site answered the last time it was asked. */
	online: boolean;
}

/** A link, whether or not its account has recordings here. */
export interface LinkView {
	id: string;
	battletag: string | null;
	started: boolean;
	hasRecordings: boolean;
	/** When anything was last sent under it. */
	lastSentAt: number | null;
}

export interface AddonView {
	/** `unknown` until the site has said which version is current. */
	state: 'missing' | 'outdated' | 'current' | 'unknown';
	installed: AddonFound[];
	latest: string | null;
}

export interface View {
	/** False until the first look has finished. */
	ready: boolean;
	/** At least one account is linked. */
	linked: boolean;
	/** Who the one link is to, when there is exactly one; null otherwise. */
	battletag: string | null;
	/** The accounts with recordings on this computer, the one played most recently first. */
	accounts: AccountView[];
	/** Every link, in the order they were made. */
	links: LinkView[];
	/**
	 * Linking is under way: the code to check against the page, the page's address, and whether
	 * this app opened it in the default browser or left that to the player.
	 */
	linking: { userCode: string; verifyUrl: string; opened: boolean } | null;
	/** Said once, above everything: why linking stopped, or that an account was unlinked. */
	notice: string | null;
	/** Whether the site answered the last time it was asked, for every link. */
	online: boolean;
	roots: string[];
	/** The ones among them the player pointed at by hand, which are the ones that can be removed. */
	manualRoots: string[];
	characters: CharacterView[];
	addon: AddonView;
	/**
	 * An account linked, with recordings here, that the player hasn't started uploading for yet:
	 * the window shows its characters and the one button that starts.
	 */
	setup: string | null;
	/** When the player last had the window in front of them. */
	lookedAt: number | null;
	/** When anything was last sent, from any file. */
	lastSentAt: number | null;
	/**
	 * The player paused uploading. The window stays current, but nothing is sent and the site isn't
	 * asked until they resume; a character can't be chosen Private or Public meanwhile.
	 */
	paused: boolean;
	/** What to call the default browser ("Chrome"), or null when the computer can't say. */
	browser: string | null;
	/** A newer version of the app, once one is found; null while this one is the newest known. */
	update: UpdateView | null;
}

interface Runtime {
	sending?: boolean;
	progress?: { sent: number; total: number } | null;
	message?: string | null;
	/** The site turned it away the last time, for the reason in `message`. */
	refused?: boolean;
	retryAt?: number;
	fails?: number;
}

/** A link while the app runs: its token, its way to the site, and what the site last said. */
interface Linked {
	id: string;
	token: string;
	api: Api;
	me: Me | null;
	meAt: number;
	meDirty: boolean;
	online: boolean;
}

export class Engine {
	view: View = {
		ready: false,
		linked: false,
		battletag: null,
		accounts: [],
		links: [],
		linking: null,
		notice: null,
		online: true,
		roots: [],
		manualRoots: [],
		characters: [],
		addon: { state: 'unknown', installed: [], latest: null },
		setup: null,
		lookedAt: null,
		lastSentAt: null,
		paused: false,
		browser: null,
		update: null
	};

	readonly #host: Host;
	/** The site with no token: for linking, which is done before there is one. */
	readonly #api: Api;
	#state: Persisted = structuredClone(EMPTY);
	/** The links, by account ID, in the order they were made. */
	#links = new Map<string, Linked>();
	/**
	 * A token from before accounts were told apart, kept under the site's address alone. Used only
	 * to ask the site whose it is, then moved under that account.
	 */
	#legacyToken: string | null = null;
	#legacyOnline = true;
	#installs: string[] = [];
	#installsAt = 0;
	#addons: AddonFound[] = [];
	#found: FoundFile[] = [];
	#runtime = new Map<string, Runtime>();
	#linking: { deviceCode: string; userCode: string; verifyUrl: string; opened: boolean } | null =
		null;
	#notice: string | null = null;
	#startingLink = false;
	#browser: string | null = null;
	#ready = false;
	#queue: Promise<void> = Promise.resolve();
	#listeners = new Set<(view: View) => void>();
	#update: UpdateView | null = null;
	/** When the update was downloaded and ready to go in. */
	#updateReadyAt = 0;
	/** When to look for a newer version next: never before the app has started. */
	#updateCheckAt = Infinity;
	/** A check, download or install under way, which every tick until it ends waits on. */
	#updateWork: Promise<void> | null = null;

	constructor(host: Host) {
		this.#host = host;
		this.#api = new Api(host.server, host.fetch, () => null);
	}

	/** Called with the view now, and again whenever it changes. */
	subscribe(listener: (view: View) => void): () => void {
		this.#listeners.add(listener);
		listener(this.view);
		return () => this.#listeners.delete(listener);
	}

	/** The credential store's key for an account's token. */
	#key(id: string): string {
		return `${this.#host.server}|${id}`;
	}

	#linkedWith(id: string, token: string): Linked {
		const linked: Linked = {
			id,
			token,
			api: new Api(this.#host.server, this.#host.fetch, () => token),
			me: null,
			meAt: 0,
			meDirty: true,
			online: true
		};
		this.#links.set(id, linked);
		return linked;
	}

	/** Reads what was remembered, then takes a first look. */
	async start(): Promise<void> {
		try {
			/**
			 * A link as an earlier version remembered it: from version 3 it said how new characters
			 * were kept, sent as Private (`automatic`) or asked about one by one (`ask`).
			 */
			type EarlierLink = { battletag?: string | null; newCharacters?: string | null };
			const saved = JSON.parse((await this.#host.loadState()) ?? 'null') as
				| (Omit<Partial<Persisted>, 'version' | 'links' | 'pendingLink'> & {
						version?: number;
						battletag?: string | null;
						newCharacters?: string | null;
						links?: Record<string, Link | EarlierLink>;
						pendingLink?: Link | EarlierLink | null;
				  })
				| null;
			/**
			 * Started, for a link remembered before there was a start: the player who chose to send
			 * every new character had started; one who chose to be asked about each sees the start
			 * once, with its characters, since what it sends by itself has changed.
			 */
			const linkOf = (link: Link | EarlierLink): Link => ({
				battletag: link.battletag ?? null,
				started: 'started' in link ? link.started : link.newCharacters === 'automatic'
			});
			if (saved?.version === 5 || saved?.version === 4 || saved?.version === 3) {
				// Version 3 also remembered which characters were ever sent from here, and took one the
				// site no longer kept to have been removed there. The site says so now, so that is
				// dropped: it was wrong whenever the site wasn't the one sent to. Before version 5 the
				// earlier characters in a file weren't told apart: none was switched on, and each file
				// is read once more to find them.
				const { keptOnce: _, ...rest } = saved as typeof saved & { keptOnce?: unknown };
				this.#state = {
					...structuredClone(EMPTY),
					...rest,
					links: Object.fromEntries(
						Object.entries(saved.links ?? {}).map(([id, link]) => [id, linkOf(link)])
					),
					pendingLink: saved.pendingLink ? linkOf(saved.pendingLink) : null,
					earlierOn: saved.earlierOn ?? [],
					version: 5
				};
			} else if (saved?.version === 2 || saved?.version === 1) {
				// Written before accounts were told apart: the one link's token is under the site's
				// address, and what was remembered of the link waits for the site to say whose it is.
				const now = this.#host.now();
				const firstSeen: Record<string, number> = { ...(saved.firstSeen ?? {}) };
				if (saved.version === 1) {
					// Before the app asked about new characters or kept track of what the player has
					// seen. Everything it already knew counts as seen, so nothing is called new.
					for (const record of Object.values(saved.files ?? {})) {
						if (record.guid) firstSeen[record.guid] = now;
					}
				}
				this.#state = {
					...structuredClone(EMPTY),
					manualRoots: saved.manualRoots ?? [],
					skipped: saved.skipped ?? [],
					files: saved.files ?? {},
					pendingLink: linkOf({
						battletag: saved.battletag,
						newCharacters: saved.newCharacters
					}),
					firstSeen,
					told: saved.told ?? [],
					lookedAt: saved.version === 1 ? now : (saved.lookedAt ?? null),
					paused: saved.paused ?? false
				};
			}
		} catch {
			// Nothing remembered, or not readable: begin again. Nothing is lost but the bookkeeping.
		}
		const ids = Object.keys(this.#state.links);
		const [tokens, legacy, browser] = await Promise.all([
			Promise.all(ids.map((id) => this.#host.secret.get(this.#key(id)).catch(() => null))),
			this.#host.secret.get(this.#host.server).catch(() => null),
			// Asked once: a player rarely changes browser while the app runs, and if they do, the
			// window only names the old one until the app starts again.
			this.#host.browser?.().catch(() => null) ?? null
		]);
		ids.forEach((id, index) => {
			const token = tokens[index];
			// A link whose token is gone from the credential store is no link.
			if (token) this.#linkedWith(id, token);
			else delete this.#state.links[id];
		});
		this.#legacyToken = legacy;
		if (!legacy) this.#state.pendingLink = null;
		this.#browser = typeof browser === 'string' && browser.trim() ? browser.trim() : null;
		// A newer version is looked for a little after starting, once the first look is out of the way.
		this.#updateCheckAt = this.#host.now() + TIMING.updateFirst;
		// What was remembered shows at once (a pause, above all), before the first look finishes.
		this.#publish();
		await this.tick();
	}

	/**
	 * Pauses uploading, or resumes it. While paused the app goes on looking at the game's folders
	 * and reading recordings, so the window stays current, but sends nothing, asks the site
	 * nothing and notifies nothing. Resuming looks again at once, with any waiting after a failure
	 * forgotten, and sends whatever is owed.
	 */
	async setPaused(on: boolean): Promise<void> {
		if (this.#state.paused === on) return;
		// Set at once, not behind a look already under way: a look that is sending stops before its
		// next file.
		this.#state.paused = on;
		await this.#save();
		this.#publish();
		if (!on) await this.sendNow();
	}

	/**
	 * One look round: called every few seconds, and whenever something may have changed. Each also
	 * sees to the app's own updates, which go on beside the looks rather than holding them up.
	 */
	async tick(): Promise<void> {
		await Promise.all([this.#enqueue(() => this.#look()), this.#updateTurn()]);
	}

	/** Look again at once, forgetting any waiting after a failure. */
	sendNow(): Promise<void> {
		for (const runtime of this.#runtime.values()) runtime.retryAt = undefined;
		for (const linked of this.#links.values()) linked.meDirty = true;
		this.#installsAt = 0;
		return this.tick();
	}

	// One thing at a time: a look and a player's choice never overlap.
	#enqueue(work: () => Promise<void>): Promise<void> {
		const next = this.#queue.then(work).catch((cause) => {
			console.error('uploader:', cause);
		});
		this.#queue = next;
		return next;
	}

	#rt(path: string): Runtime {
		let runtime = this.#runtime.get(path);
		if (!runtime) this.#runtime.set(path, (runtime = {}));
		return runtime;
	}

	// ---- Linking -------------------------------------------------------------------------------

	/**
	 * Asks the site for a pair of codes, then waits for the short one to be approved on the site's
	 * page. `open`: open that page in the default browser. Without it the player takes the page's
	 * address to whichever browser they are signed in on. Whoever signs in on the site is the
	 * account linked, whichever of the computer's accounts the player had in mind.
	 */
	async link(open = true): Promise<void> {
		if (this.#linking || this.#startingLink) return;
		this.#startingLink = true;
		this.#notice = null;
		try {
			const started = await this.#api.startLink(await this.#host.computerName());
			this.#linking = { ...started, opened: open };
			this.#publish();
			if (open) await this.#host.open(started.verifyUrl).catch(() => {});
			void this.#awaitLink(started.deviceCode, started.interval, started.expiresIn);
		} catch {
			// Named by its address: when the app is pointed at a copy of the site that isn't
			// running, or at one that isn't live yet, the address says which.
			const site = new URL(this.#api.server).host;
			this.#notice = `${site} couldn’t be reached, so linking didn’t start. Check your connection and try again.`;
			this.#publish();
		} finally {
			this.#startingLink = false;
		}
	}

	async #awaitLink(deviceCode: string, interval: number, expiresIn: number): Promise<void> {
		const until = this.#host.now() + expiresIn * 1000;
		while (this.#linking?.deviceCode === deviceCode) {
			await this.#host.sleep(Math.max(1, interval) * 1000);
			if (this.#linking?.deviceCode !== deviceCode) return;
			if (this.#host.now() > until) break;
			let answer;
			try {
				answer = await this.#api.askLink(deviceCode);
			} catch {
				continue; // The site didn't answer: ask again.
			}
			if (answer.status === 'waiting') continue;
			if (answer.status === 'linked') {
				this.#linking = null;
				await this.#enqueue(() => this.#takeLink(answer.token, answer.battletag, answer.battlenetId));
				return;
			}
			break;
		}
		if (this.#linking?.deviceCode === deviceCode) {
			this.#linking = null;
			this.#notice = 'The link ran out before it was approved. Nothing was linked.';
			this.#publish();
		}
	}

	/**
	 * A link approved: kept under the account the site named. A site that didn't say is asked once
	 * with the token; if it still can't say, the token is given back, since a link that can't be
	 * matched to a folder would send nobody's recordings.
	 */
	async #takeLink(token: string, battletag: string | null, id: string | null): Promise<void> {
		const api = new Api(this.#host.server, this.#host.fetch, () => token);
		let me: Me | null = null;
		if (id === null) {
			try {
				me = await api.me();
				id = me.battlenetId;
				battletag = me.battletag ?? battletag;
			} catch {
				// Asked again below, by the look, once the link is kept; without an ID it can't be.
			}
		}
		if (id === null) {
			await api.unlink().catch(() => {});
			this.#notice = `${SITE_NAME} didn’t say which Battle.net account was linked, so nothing was linked. Try again in a moment.`;
			this.#publish();
			return;
		}
		// Linked again as an account already linked: the old token is given back first.
		const before = this.#links.get(id);
		if (before) await before.api.unlink().catch(() => {});
		const linked = this.#linkedWith(id, token);
		if (me) {
			linked.me = me;
			linked.meAt = this.#host.now();
			linked.meDirty = false;
		}
		await this.#host.secret.set(this.#key(id), token).catch(() => {});
		this.#state.links[id] = {
			battletag,
			started: this.#state.links[id]?.started ?? false
		};
		// Unlinked again later is worth saying again.
		this.#state.told = this.#state.told.filter((key) => key !== `unlinked:${id}`);
		// Linked as an account that doesn't play here, while others do: said, since the player may
		// have signed in as the wrong one.
		const here = new Set(this.#found.map((file) => accountIdOf(file.account)));
		if (!here.has(id) && this.#found.length > 0) {
			this.#notice = `Linked as ${battletag ?? 'an account'}, but none of the recordings on this computer are that account’s. To send another account’s, link again and sign in as it.`;
		}
		await this.#save();
		this.#publish();
		await this.#look();
	}

	/** Opens the linking page in the default browser: again, or for the first time. */
	async reopenLink(): Promise<void> {
		if (!this.#linking) return;
		await this.#host.open(this.#linking.verifyUrl).catch(() => {});
		if (!this.#linking.opened) {
			this.#linking.opened = true;
			this.#publish();
		}
	}

	cancelLink(): void {
		this.#linking = null;
		this.#publish();
	}

	/**
	 * Gives up an account's token, here and on the site; the one link's when `id` isn't said.
	 * Recordings on the site stay.
	 */
	unlink(id?: string): Promise<void> {
		return this.#enqueue(async () => {
			const linked = id === undefined ? this.#onlyLink() : this.#links.get(id);
			if (!linked) return;
			await linked.api.unlink().catch(() => {});
			await this.#dropLink(linked.id, null);
		});
	}

	/** The one link, when there is exactly one. */
	#onlyLink(): Linked | null {
		return this.#links.size === 1 ? [...this.#links.values()][0] : null;
	}

	/** `notice`: the site unlinked this account, and the player is told why it stopped. */
	async #dropLink(id: string, notice: string | null): Promise<void> {
		this.#links.delete(id);
		// A new link may be made by someone else: it starts again from the start.
		delete this.#state.links[id];
		this.#notice = notice;
		for (const row of this.#rows()) {
			if (accountIdOf(row.file.account) === id) this.#runtime.delete(row.key);
		}
		await this.#host.secret.clear(this.#key(id)).catch(() => {});
		if (notice) await this.#tell(`unlinked:${id}`, `Unlinked from ${SITE_NAME}`, notice);
		await this.#save();
		this.#publish();
	}

	/** An OS notification, sent once for each key and never again. */
	async #tell(key: string, title: string, body: string): Promise<void> {
		if (this.#state.told.includes(key)) return;
		this.#state.told.push(key);
		await this.#host.notify(title, body).catch(() => {});
	}

	// ---- The player's choices -------------------------------------------------------------------

	/**
	 * The player starts uploading for an account, once, after linking: every character of its on
	 * this computer is kept Private on the site from now on, as are the ones it plays later, but
	 * for those switched off (which the start screen does with `setUploading` before this). For the
	 * account whose start is up when `id` isn't said.
	 */
	beginUploading(id?: string): Promise<void> {
		return this.#enqueue(async () => {
			const of = id ?? this.#setupFor() ?? '';
			const link = this.#state.links[of];
			if (!link || !this.#links.has(of)) return;
			link.started = true;
			await this.#save();
			await this.#look();
		});
	}

	/** The window was shown: what was new or sent until now has been seen. */
	async looked(): Promise<void> {
		this.#inView = true;
		this.#state.lookedAt = this.#host.now();
		await this.#save();
		this.#publish();
	}

	/** The window was hidden again: an update may now go in by itself once the rest holds. */
	left(): void {
		this.#inView = false;
	}

	/** Whether the window is in front of the player right now, as the window last said. */
	#inView = false;

	/**
	 * The player switches uploading on or off for one character (by file). Off, it is never sent,
	 * whatever the site keeps. On again, it goes the way every character goes, Private if the site
	 * doesn't keep it yet; one removed on the site comes back whole, since switching it on is the
	 * player's own choice to bring back what they deleted. While uploading is paused the switch is
	 * taken, and whatever it sends waits for the resume. `key` is a row's, so an earlier character
	 * in a file is switched apart from the file's own.
	 */
	setUploading(key: string, on: boolean): Promise<void> {
		return this.#enqueue(async () => {
			const row = this.#rows().find((r) => r.key === key);
			const guid = row ? this.#guidOf(row) : null;
			if (!guid) return;
			if (!on) {
				if (!this.#state.skipped.includes(guid)) this.#state.skipped.push(guid);
				this.#state.earlierOn = this.#state.earlierOn.filter((g) => g !== guid);
				const runtime = this.#rt(key);
				runtime.message = null;
				runtime.refused = false;
				await this.#save();
				this.#publish();
				return;
			}
			this.#state.skipped = this.#state.skipped.filter((skipped) => skipped !== guid);
			if (row?.former && !this.#state.earlierOn.includes(guid)) this.#state.earlierOn.push(guid);
			if (guid in this.#state.removed) {
				delete this.#state.removed[guid];
				if (!this.#state.restored.includes(guid)) this.#state.restored.push(guid);
			}
			// Turned away before: switched on again is worth trying at once.
			for (const other of this.#rows()) {
				if (this.#guidOf(other) === guid) this.#rt(other.key).retryAt = undefined;
			}
			await this.#save();
			await this.#look();
		});
	}

	/**
	 * The rows of the window, in the files' order: each file's own character, then the earlier
	 * characters in it.
	 */
	#rows(): Row[] {
		const rows: Row[] = [];
		for (const file of this.#found) {
			rows.push({ key: file.path, file, former: null });
			for (const guid of Object.keys(this.#state.files[file.path]?.earlier ?? {})) {
				rows.push({ key: `${file.path}#${guid}`, file, former: guid });
			}
		}
		return rows;
	}

	/** A row's character, by GUID; null when its file names none. */
	#guidOf(row: Row): string | null {
		return row.former ?? this.#state.files[row.file.path]?.guid ?? null;
	}

	/** How far a row's character has been sent: the file's own bookkeeping, or the earlier one's. */
	#sendingOf(row: Row): Sending | null {
		const record = this.#state.files[row.file.path];
		if (!record) return null;
		return row.former ? (record.earlier?.[row.former] ?? null) : record;
	}

	/**
	 * Whether a row's character is off: switched off here, or an earlier character the site doesn't
	 * keep that the player hasn't switched on.
	 */
	#isOff(row: Row, guid: string, kept: boolean): boolean {
		if (this.#state.skipped.includes(guid)) return true;
		return row.former !== null && !kept && !this.#state.earlierOn.includes(guid);
	}

	/** The player points at a game folder the search didn't find. */
	addRoot(root: string): Promise<void> {
		return this.#enqueue(async () => {
			if (!this.#state.manualRoots.includes(root)) this.#state.manualRoots.push(root);
			this.#installsAt = 0;
			await this.#save();
			await this.#look();
		});
	}

	removeRoot(root: string): Promise<void> {
		return this.#enqueue(async () => {
			this.#state.manualRoots = this.#state.manualRoots.filter((r) => r !== root);
			await this.#save();
			await this.#look();
		});
	}

	// ---- The look round --------------------------------------------------------------------------

	#roots(): string[] {
		const seen = new Set<string>();
		return [...this.#state.manualRoots, ...this.#installs].filter((root) => {
			const key = root.toLowerCase().replace(/[\\/]+$/, '');
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	/**
	 * The link a file is sent under: its account folder's. A folder that doesn't say whose it is
	 * (an old install's, named in capitals) goes under the one link when there is exactly one, as
	 * it did before accounts were told apart, and nowhere when there are several.
	 */
	#linkFor(file: FoundFile): Linked | null {
		const id = accountIdOf(file.account);
		return id === null ? this.#onlyLink() : (this.#links.get(id) ?? null);
	}

	async #look(): Promise<void> {
		const now = this.#host.now();

		// Where the game is, and whether the addon is there.
		const refreshInstalls = !this.#ready || now - this.#installsAt > TIMING.installs;
		if (refreshInstalls) {
			this.#installs = await this.#host.findInstalls().catch(() => this.#installs);
			this.#installsAt = now;
		}
		const roots = this.#roots();
		if (refreshInstalls) {
			const perRoot = await Promise.all(roots.map((r) => this.#host.addons(r).catch(() => [])));
			this.#addons = perRoot.flat();
		}

		// Which recordings are there, and under which accounts.
		const scanned = await Promise.all(roots.map((r) => this.#host.scan(r).catch(() => [])));
		const byPath = new Map<string, FoundFile>();
		for (const file of scanned.flat()) byPath.set(file.path, file);
		this.#found = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
		for (const path of Object.keys(this.#state.files)) {
			if (!byPath.has(path)) {
				delete this.#state.files[path];
				for (const key of [...this.#runtime.keys()]) {
					if (key === path || key.startsWith(`${path}#`)) this.#runtime.delete(key);
				}
			}
		}
		for (const file of this.#found) {
			const id = accountIdOf(file.account);
			if (id !== null && this.#state.accountsSeen[id] === undefined) {
				this.#state.accountsSeen[id] = now;
			}
		}

		// Read the ones that changed since they were last read.
		const justRead = new Map<string, SplitFile>();
		for (const file of this.#found) {
			const record = this.#state.files[file.path];
			const unchanged = record && record.modified === file.modified && record.size === file.size;
			// Read once more if it was read before the app kept what the recording says of its game,
			// or before it told the earlier characters in a file apart.
			if (unchanged && ((record.game !== undefined && record.earlier) || record.unreadable)) {
				continue;
			}
			// The game may still be writing it: leave it for the next look.
			if (now - file.modified < TIMING.settle) continue;
			const kept = {
				sentModified: record?.sentModified ?? null,
				sentAt: record?.sentAt ?? null,
				owesDone: record?.owesDone
			};
			try {
				const split = splitRecording(await this.#host.read(file.path));
				const earlier: Record<string, EarlierRecord> = {};
				for (const group of split.earlier) {
					const before = record?.earlier?.[group.guid];
					const starts = group.sessions
						.map((s) => s.serverTime)
						.filter((time): time is number => time !== null);
					earlier[group.guid] = {
						sessions: group.sessions.length,
						game: group.game,
						lastStartedAt: starts.length ? Math.max(...starts) * 1000 : null,
						sentModified: before?.sentModified ?? null,
						sentAt: before?.sentAt ?? null,
						owesDone: before?.owesDone
					};
				}
				this.#state.files[file.path] = {
					modified: file.modified,
					size: file.size,
					guid: split.guid,
					name: split.name,
					realm: split.realm,
					sessions: ownSessions(split).length,
					earlier,
					classID: split.classID,
					raceID: split.raceID,
					region: split.region,
					game: split.game,
					...kept
				};
				for (const guid of [split.guid, ...Object.keys(earlier)]) {
					if (guid && this.#state.firstSeen[guid] === undefined) this.#state.firstSeen[guid] = now;
				}
				justRead.set(file.path, split);
			} catch (cause) {
				// Fresh and unreadable is most likely half-written: try again on the next look.
				if (now - file.modified < TIMING.unreadableAfter) continue;
				this.#state.files[file.path] = {
					modified: file.modified,
					size: file.size,
					guid: record?.guid ?? null,
					name: record?.name ?? null,
					realm: record?.realm ?? null,
					sessions: record?.sessions ?? 0,
					earlier: record?.earlier,
					classID: record?.classID ?? null,
					raceID: record?.raceID ?? null,
					region: record?.region ?? null,
					game: record?.game ?? null,
					unreadable:
						cause instanceof NotARecording ? cause.message : 'The file couldn’t be opened.',
					...kept
				};
			}
		}
		this.#ready = true;
		this.#publish();

		// What each account keeps, then send what is owed. Not while the player has paused
		// uploading: then the site is asked nothing, nothing is sent, and nothing is notified.
		if (!this.#state.paused) {
			if (this.#legacyToken) await this.#placeLegacyLink();
			for (const linked of [...this.#links.values()]) {
				if (!this.#links.has(linked.id)) continue;
				if (linked.meDirty || !linked.me || now - linked.meAt > TIMING.account) {
					await this.#askAccount(linked);
				}
			}
			for (const row of this.#rows()) {
				// Paused part-way through: the character being sent is finished, the rest wait.
				if (this.#state.paused) break;
				const linked = this.#linkFor(row.file);
				if (!linked?.me) continue;
				const record = this.#state.files[row.file.path];
				const guid = this.#guidOf(row);
				const sending = this.#sendingOf(row);
				if (!record || !guid || !sending || record.unreadable) continue;
				const kept = linked.me.kept.some((k) => k.guid === guid);
				if (this.#isOff(row, guid, kept)) continue;
				if (kept && sending.sentModified === record.modified && !sending.owesDone) continue;
				// Not kept yet: sent as Private once the player has started, unless they removed it.
				if (!kept && (!this.#state.links[linked.id]?.started || guid in this.#state.removed)) {
					continue;
				}
				const retryAt = this.#rt(row.key).retryAt;
				if (retryAt !== undefined && this.#host.now() < retryAt) continue;
				const split = justRead.get(row.file.path);
				if (kept) await this.#send(linked, row, split);
				else {
					const fresh = this.#state.restored.includes(guid);
					await this.#send(linked, row, split, 'private', fresh);
				}
			}
			if (!this.#state.paused) await this.#tellWhatAwaits();
		}
		await this.#save();
		this.#publish();
	}

	/**
	 * A token from before accounts were told apart: the site is asked whose it is, and it is kept
	 * under that account from then on, with what was remembered of the link. A site that doesn't
	 * say leaves it where it is, asked again at the next look; a site that no longer knows it
	 * means the link was undone there.
	 */
	async #placeLegacyLink(): Promise<void> {
		const token = this.#legacyToken;
		if (!token) return;
		const api = new Api(this.#host.server, this.#host.fetch, () => token);
		let me: Me;
		try {
			me = await api.me();
		} catch (cause) {
			if (cause instanceof Unlinked) {
				this.#legacyToken = null;
				this.#state.pendingLink = null;
				await this.#host.secret.clear(this.#host.server).catch(() => {});
				await this.#tell(
					'unlinked',
					`Unlinked from ${SITE_NAME}`,
					`This computer was unlinked on ${SITE_NAME}. Link it again to go on sending.`
				);
				return;
			}
			this.#legacyOnline = false;
			return;
		}
		this.#legacyOnline = true;
		if (me.battlenetId === null) return;
		const id = me.battlenetId;
		const linked = this.#linkedWith(id, token);
		linked.me = me;
		linked.meAt = this.#host.now();
		linked.meDirty = false;
		this.#state.links[id] = {
			battletag: me.battletag ?? this.#state.pendingLink?.battletag ?? null,
			started: this.#state.pendingLink?.started ?? false
		};
		this.#state.pendingLink = null;
		this.#legacyToken = null;
		await this.#host.secret.set(this.#key(id), token).catch(() => {});
		await this.#host.secret.clear(this.#host.server).catch(() => {});
		this.#keptAgain(me);
	}

	/** A character the site keeps again (brought from the browser, perhaps) is no longer removed. */
	#keptAgain(me: Me): void {
		for (const kept of me.kept) {
			delete this.#state.removed[kept.guid];
			this.#state.restored = this.#state.restored.filter((guid) => guid !== kept.guid);
		}
	}

	/**
	 * What the player has to do, each said once: link an account that started playing here, update
	 * the addon.
	 */
	async #tellWhatAwaits(): Promise<void> {
		// Another account's recordings, first seen since the player last looked, while some
		// account is linked: before any link the window itself says what to do.
		if (this.#links.size > 0) {
			const lookedAt = this.#state.lookedAt;
			for (const [id, seen] of Object.entries(this.#state.accountsSeen)) {
				if (this.#links.has(id) || !this.#found.some((f) => accountIdOf(f.account) === id)) continue;
				if (lookedAt !== null && seen <= lookedAt) continue;
				await this.#tell(
					`account:${id}`,
					'Another account plays on this computer',
					`Link it in ${APP_NAME} to send its recordings to ${SITE_NAME}. Until then nothing of its is sent.`
				);
			}
		}
		const addon = this.#addonView();
		if (addon.state === 'outdated' && addon.latest && this.#links.size > 0) {
			await this.#tell(
				`addon:${addon.latest}`,
				`A newer ${SITE_NAME} addon`,
				`Version ${addon.latest} of the addon is out, and the copy in your game is older.`
			);
		}
	}

	async #askAccount(linked: Linked): Promise<void> {
		try {
			linked.me = await linked.api.me();
			linked.meAt = this.#host.now();
			linked.meDirty = false;
			linked.online = true;
			const link = this.#state.links[linked.id];
			if (link) link.battletag = linked.me.battletag ?? link.battletag;
			this.#keptAgain(linked.me);
		} catch (cause) {
			if (cause instanceof Unlinked) {
				await this.#dropLink(
					linked.id,
					`${this.#state.links[linked.id]?.battletag ?? 'An account'} was unlinked from this computer on ${SITE_NAME}. Link it again to go on sending.`
				);
				return;
			}
			linked.online = false;
			// Ask again in about a minute, not on every look.
			linked.meAt = this.#host.now() - TIMING.account + 60000;
			linked.meDirty = false;
		}
	}

	/**
	 * Sends one row's character under its account's link: a file's own, or an earlier character
	 * in it, each with its own sessions alone. `sharing` only while the site doesn't keep the
	 * character yet; `fresh`, when sending it is the player's own choice to bring it back after
	 * removing it, so the sessions they deleted come back too.
	 */
	async #send(
		linked: Linked,
		row: Row,
		split?: SplitFile,
		sharing?: Sharing,
		fresh = false
	): Promise<void> {
		const file = row.file;
		const record = this.#state.files[file.path];
		const sending = this.#sendingOf(row);
		const guid = this.#guidOf(row);
		if (!record || !sending) return;
		const runtime = this.#rt(row.key);
		runtime.sending = true;
		runtime.progress = null;
		runtime.message = null;
		runtime.refused = false;
		this.#publish();
		try {
			let whole = split;
			if (!whole) {
				try {
					whole = splitRecording(await this.#host.read(file.path));
				} catch {
					runtime.message = 'The file couldn’t be read just now. It will be tried again.';
					this.#backOff(runtime);
					return;
				}
			}
			const recording = row.former ? asEarlier(whole, row.former) : whole;
			// The earlier character is no longer in the file: the next read takes its row away.
			if (!recording) return;
			const outcome = await syncRecording(linked.api, recording, this.#host.tools, {
				sharing,
				fresh,
				owesDone: sending.owesDone,
				tooLarge: sending.tooLarge,
				onProgress: (sent, total) => {
					runtime.progress = { sent, total };
					this.#publish();
				}
			});
			if (outcome.ok) {
				linked.online = true;
				sending.sentModified = record.modified;
				sending.sentAt = this.#host.now();
				sending.owesDone = false;
				sending.tooLarge =
					outcome.tooLarge.length > 0
						? Object.fromEntries(outcome.tooLarge.map((t) => [String(t.serverTime), t.length]))
						: undefined;
				runtime.fails = 0;
				runtime.retryAt = undefined;
				runtime.message = outcome.refused
					? `${outcome.refused} ${outcome.refused === 1 ? 'session was' : 'sessions were'} different from the copy already kept, and set aside.`
					: null;
				if (guid) this.#state.restored = this.#state.restored.filter((g) => g !== guid);
				if (sharing) await this.#askAccount(linked);
				return;
			}
			if (outcome.sent > 0) sending.owesDone = true;
			// A first choice may have reached the site even though the sending failed: ask what it keeps.
			if (sharing) linked.meDirty = true;
			switch (outcome.reason) {
				case 'unlinked':
					await this.#dropLink(
						linked.id,
						`${this.#state.links[linked.id]?.battletag ?? 'An account'} was unlinked from this computer on ${SITE_NAME}. Link it again to go on sending.`
					);
					return;
				case 'undecided':
					// The site no longer keeps it (removed there, perhaps): ask what it keeps again.
					linked.meDirty = true;
					runtime.message = null;
					return;
				case 'removed':
					// The player removed it on the site: it waits for them to switch it back on. Their
					// own act, so nothing is notified.
					if (guid) this.#state.removed[guid] = outcome.removedAt;
					runtime.message = null;
					return;
				case 'kept-elsewhere':
				case 'no-region':
				case 'no-character':
					// Turned away for a reason waiting won't mend soon: said on the card, and told once.
					runtime.message = outcome.message;
					runtime.refused = true;
					runtime.retryAt = this.#host.now() + TIMING.turnedAway;
					await this.#tell(
						`away:${guid ?? file.path}:${outcome.reason}`,
						record.name ?? file.character,
						outcome.message
					);
					return;
				default:
					// The site failing, or turning it away for a reason this version doesn't know (one an
					// older site gave, perhaps): tried again later, like any failure, without a word.
					runtime.message = outcome.message;
					this.#backOff(runtime);
					return;
			}
		} finally {
			runtime.sending = false;
			runtime.progress = null;
		}
	}

	#backOff(runtime: Runtime): void {
		runtime.fails = (runtime.fails ?? 0) + 1;
		const wait = Math.min(TIMING.retryMax, TIMING.retry * 2 ** (runtime.fails - 1));
		runtime.retryAt = this.#host.now() + wait;
	}

	// ---- Updating itself ---------------------------------------------------------------------------

	/**
	 * Installs the downloaded update now, because the player asked: once the look under way has
	 * finished, so nothing is ever cut off part-way through sending.
	 */
	installUpdate(): Promise<void> {
		return this.#enqueue(() => this.#install(true));
	}

	/** Sees to updates on a tick, or joins the check, download or install already under way. */
	#updateTurn(): Promise<void> {
		if (!this.#host.updates) return Promise.resolve();
		this.#updateWork ??= this.#updateRound().finally(() => (this.#updateWork = null));
		return this.#updateWork;
	}

	/**
	 * Looks for a newer version when one is due (half a minute after starting, then every six
	 * hours) and downloads it as soon as it is found. A ready one goes in by itself only while
	 * the app is left alone. Not while uploading is paused: then the site is asked nothing.
	 */
	async #updateRound(): Promise<void> {
		const updates = this.#host.updates;
		if (!updates) return;
		const now = this.#host.now();
		if (this.#update?.state === 'ready' && this.#leftAlone(now)) {
			await this.#enqueue(() => this.#install(false));
			return;
		}
		if (this.#state.paused || now < this.#updateCheckAt) return;
		this.#updateCheckAt = now + TIMING.updateEvery;
		let found;
		try {
			found = await updates.check();
		} catch {
			// The feed couldn't be read: nothing is said, and it is asked again at the next check.
			return;
		}
		if (!found) {
			this.#update = null;
			this.#publish();
			return;
		}
		const known = this.#update;
		if (known?.version === found.version && known.state === 'ready') return;
		const update: UpdateView = {
			version: found.version,
			notes: found.notes,
			state: 'downloading',
			progress: null,
			message: null
		};
		this.#update = update;
		this.#publish();
		try {
			await updates.download((done, total) => {
				if (this.#update !== update) return;
				update.progress = total ? Math.min(1, done / total) : null;
				this.#publish();
			});
		} catch {
			if (this.#update === update) {
				this.#update = {
					...update,
					state: 'failed',
					progress: null,
					message: `Version ${update.version} couldn’t be downloaded. The app will try again later.`
				};
				this.#publish();
			}
			return;
		}
		if (this.#update !== update) return;
		this.#update = { ...update, state: 'ready', progress: null };
		this.#updateReadyAt = this.#host.now();
		this.#publish();
	}

	/**
	 * Whether a ready update may install on its own: ready for ten minutes, window hidden and not
	 * looked at for ten minutes, nothing being sent. Never restart under someone's eyes.
	 */
	#leftAlone(now: number): boolean {
		const lookedAt = this.#state.lookedAt;
		return (
			!this.#inView &&
			now - this.#updateReadyAt >= TIMING.updateIdle &&
			(lookedAt === null || now - lookedAt >= TIMING.updateIdle) &&
			!this.#sending()
		);
	}

	#sending(): boolean {
		return [...this.#runtime.values()].some((runtime) => runtime.sending);
	}

	/**
	 * Installs the ready update, between looks so that no file is being sent. `asked`: the player
	 * asked for it, so the new version shows its window; one that goes in by itself checks again
	 * that the app is still left alone, and the new version stays in the tray.
	 */
	async #install(asked: boolean): Promise<void> {
		const update = this.#update;
		const updates = this.#host.updates;
		if (!updates || update?.state !== 'ready' || this.#sending()) return;
		if (!asked && !this.#leftAlone(this.#host.now())) return;
		this.#update = { ...update, state: 'installing' };
		this.#publish();
		await this.#save();
		try {
			// On success the app ends here and the new version starts in its place.
			await updates.install(asked);
		} catch {
			this.#update = {
				...update,
				state: 'failed',
				message: `Version ${update.version} couldn’t be installed. The app will try again later.`
			};
			this.#publish();
		}
	}

	// ---- What the window shows ---------------------------------------------------------------------

	#character(row: Row): CharacterView {
		const file = row.file;
		const record = this.#state.files[file.path];
		const earlier = row.former ? (record?.earlier?.[row.former] ?? null) : null;
		const sending = this.#sendingOf(row);
		const runtime = this.#runtime.get(row.key) ?? {};
		const linked = this.#linkFor(file);
		const guid = this.#guidOf(row);
		const kept = guid ? linked?.me?.kept.find((k) => k.guid === guid) : undefined;
		const removed = guid !== null && guid in this.#state.removed;
		let status: CharacterStatus;
		if (!record) status = 'reading';
		else if (record.unreadable) status = 'unreadable';
		else if (runtime.sending) status = 'sending';
		else if (guid && this.#isOff(row, guid, !!kept)) status = 'skipped';
		else if (!linked) status = 'unlinked';
		else if (!linked.me) status = 'waiting';
		else if (kept) status = 'kept';
		else if (removed) status = 'removed';
		else if (!this.#state.links[linked.id]?.started) status = 'unstarted';
		else if (runtime.refused) status = 'refused';
		else status = 'new';
		const lookedAt = this.#state.lookedAt;
		const since = (at: number | null) => at !== null && (lookedAt === null || at > lookedAt);
		const firstSeen = guid ? (this.#state.firstSeen[guid] ?? null) : null;
		// An earlier character's class and race aren't in the file, whose table is the newer one's:
		// only the site can say them.
		const classID = kept?.classID ?? (row.former ? null : (record?.classID ?? null));
		const game = kept?.game ?? (earlier ? earlier.game : null) ?? record?.game ?? null;
		const icons = linked?.me?.art.classIcons?.replace(/\/+$/, '') ?? this.#anyIcons();
		return {
			key: row.key,
			guid,
			name: kept?.name ?? record?.name ?? file.character,
			realm: record?.realm ?? file.realm,
			flavor: file.flavor,
			account: accountIdOf(file.account),
			earlier: isEarlierFile(file.path),
			former: row.former !== null,
			sessions: (earlier ?? record)?.sessions ?? 0,
			status,
			sharing: kept?.sharing ?? null,
			upToDate: !!record && sending?.sentModified === record.modified && !sending.owesDone,
			progress: runtime.sending ? (runtime.progress ?? null) : null,
			sentAt: sending?.sentAt ?? null,
			removedAt: removed && guid ? (this.#state.removed[guid] ?? null) : null,
			message: record?.unreadable ?? runtime.message ?? tooLargeNote(sending),
			pageUrl:
				kept && guid
					? `${this.#host.server}${kept.href ?? `/character/${encodeURIComponent(guid)}`}`
					: null,
			verified: kept?.verified ?? null,
			classID,
			raceID: kept?.raceID ?? (row.former ? null : (record?.raceID ?? null)),
			race: kept?.race ?? null,
			region: record?.region ?? null,
			level: kept?.level ?? null,
			playedMs: kept?.playedMs ?? null,
			gamePlayedMs: kept?.gamePlayedMs ?? null,
			lastPlayedMs: kept?.lastPlayedMs ?? null,
			sittings: kept?.sittings ?? null,
			savedAt: earlier?.lastStartedAt ?? file.modified,
			game,
			gameLabel: kept?.modeLabel ?? (game ? GAME_LABELS[game] : flavorName(file.flavor)),
			classIcon: icons && classID !== null ? `${icons}/${classID}.png` : null,
			firstSeen,
			isNew: since(firstSeen),
			sentSinceLooked: since(sending?.sentAt ?? null)
		};
	}

	/** Where the class icons are, as any link's answer said: the same for every account. */
	#anyIcons(): string | null {
		for (const linked of this.#links.values()) {
			const icons = linked.me?.art.classIcons;
			if (icons) return icons.replace(/\/+$/, '');
		}
		return null;
	}

	#addonView(): AddonView {
		const installed = this.#addons;
		let latest: string | null = null;
		for (const linked of this.#links.values()) latest ??= linked.me?.addon.version ?? null;
		if (installed.length === 0) return { state: 'missing', installed, latest };
		if (latest === null) return { state: 'unknown', installed, latest };
		const outdated = installed.some((a) => a.version !== null && isOlder(a.version, latest));
		return { state: outdated ? 'outdated' : 'current', installed, latest };
	}

	/** The account whose start is up: linked, with recordings here, not started yet. */
	#setupFor(): string | null {
		for (const id of Object.keys(this.#state.links)) {
			if (!this.#links.has(id)) continue;
			if (this.#state.links[id].started) continue;
			if (this.#found.some((file) => this.#linkFor(file)?.id === id)) return id;
		}
		return null;
	}

	#accounts(characters: CharacterView[]): AccountView[] {
		const byId = new Map<string | null, AccountView>();
		const lookedAt = this.#state.lookedAt;
		for (const file of this.#found) {
			const id = accountIdOf(file.account);
			const character = characters.find((c) => c.key === file.path);
			const linked = this.#linkFor(file);
			const link = linked ? this.#state.links[linked.id] : undefined;
			let account = byId.get(id);
			if (!account) {
				const seen = id === null ? null : (this.#state.accountsSeen[id] ?? null);
				account = {
					id,
					linked: linked !== null,
					battletag: link?.battletag ?? null,
					started: link?.started ?? false,
					lastPlayedAt: null,
					characters: 0,
					isNew: seen !== null && (lookedAt === null || seen > lookedAt),
					sentSinceLooked: false,
					online: linked?.online ?? true
				};
				byId.set(id, account);
			}
			account.characters++;
			if (account.lastPlayedAt === null || file.modified > account.lastPlayedAt) {
				account.lastPlayedAt = file.modified;
			}
			if (character?.isNew) account.isNew = true;
			if (character?.sentSinceLooked) account.sentSinceLooked = true;
		}
		return [...byId.values()].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
	}

	#linkViews(): LinkView[] {
		return [...this.#links.values()].map((linked) => {
			const link = this.#state.links[linked.id];
			let lastSentAt: number | null = null;
			let hasRecordings = false;
			for (const row of this.#rows()) {
				if (this.#linkFor(row.file) !== linked) continue;
				hasRecordings = true;
				const sentAt = this.#sendingOf(row)?.sentAt ?? null;
				if (sentAt !== null && (lastSentAt === null || sentAt > lastSentAt)) lastSentAt = sentAt;
			}
			return {
				id: linked.id,
				battletag: link?.battletag ?? null,
				started: link?.started ?? false,
				hasRecordings,
				lastSentAt
			};
		});
	}

	#publish(): void {
		const rows = this.#rows();
		const characters = rows.map((row) => this.#character(row));
		const only = this.#onlyLink();
		const onlyLink = only ? this.#state.links[only.id] : undefined;
		const linked = this.#links.size > 0 || this.#legacyToken !== null;
		this.view = {
			ready: this.#ready,
			linked,
			battletag: onlyLink?.battletag ?? (this.#links.size === 0 ? (this.#state.pendingLink?.battletag ?? null) : null),
			accounts: this.#accounts(characters),
			links: this.#linkViews(),
			linking: this.#linking
				? {
						userCode: this.#linking.userCode,
						verifyUrl: this.#linking.verifyUrl,
						opened: this.#linking.opened
					}
				: null,
			notice: this.#notice,
			online: this.#legacyOnline && [...this.#links.values()].every((l) => l.online),
			roots: this.#roots(),
			manualRoots: [...this.#state.manualRoots],
			characters,
			addon: this.#addonView(),
			setup: this.#setupFor(),
			lookedAt: this.#state.lookedAt,
			lastSentAt: rows.reduce<number | null>((newest, row) => {
				const sentAt = this.#sendingOf(row)?.sentAt ?? null;
				return sentAt !== null && (newest === null || sentAt > newest) ? sentAt : newest;
			}, null),
			paused: this.#state.paused,
			browser: this.#browser,
			update: this.#update ? { ...this.#update } : null
		};
		for (const listener of this.#listeners) listener(this.view);
	}

	async #save(): Promise<void> {
		await this.#host.saveState(JSON.stringify(this.#state)).catch(() => {});
	}
}
