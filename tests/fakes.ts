// A made-up computer and a made-up site, for the tests: files in memory, a clock that moves only
// when told, and a site that keeps what it is sent the way the real one does.

import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Fetch, Sharing } from '../src/core/api.ts';
import type { AddonFound, FoundFile, Host } from '../src/core/engine.ts';

/** The player, and another person who plays on the same computer. */
export const OWNER = { battletag: 'Owner#1', battlenetId: '12345678' };
export const GUEST = { battletag: 'Guest#2', battlenetId: '87654321' };

export const SEVRA = 'Player-1071-0A5E1DA1';
export const AVERIL = 'Player-1071-0A7E0112';

/** The game client a recording says it was made in: its version and project ID, or neither. */
export interface Client {
	clientVersion?: string;
	projectID?: number | null;
}

/**
 * A recording file as the game writes it: `sessions` are [serverTime, extraLines, closed, player],
 * `player` the GUID its SESSION line names, the table's `guid` unless said: another is an
 * earlier character of the same name, deleted in the game, whose sessions the file still holds.
 * `earlier`: as the addon wrote it under its earlier name, WoWJourney. A session with extra lines
 * also ends with a /say, as older versions of the addon wrote one, which is never sent. `client`:
 * the game its SESSION lines name, Retail unless said; an empty version and a null project name
 * none.
 */
export function recording(
	guid: string,
	name: string,
	sessions: [number, number, boolean?, string?][],
	region = 1,
	earlier = false,
	client: Client = {}
): string {
	const prefix = earlier ? 'WoWJourney' : 'Widsith';
	const version = client.clientVersion ?? '12.1.0';
	const project = client.projectID === undefined ? 1 : (client.projectID ?? '');
	const containers = sessions.map(([serverTime, extra, closed = true, player = guid], index) => {
		const lines = [
			`0\tSESSION\t${serverTime}\t0.2.24\t1\t${version}\t69875\t${project}\tenUS\t1\t0\t${player}`
		];
		for (let i = 1; i <= extra; i++) lines.push(`${i * 1000}\tPOS\t37\t0.5\t0.5\t-9000\t300\t50`);
		if (extra > 0) lines.push(`${extra * 1000 + 500}\tSPEECH\tsay\t7\tWell met`);
		return `\t\t{
			["encoding"] = "raw",
			["chunks"] = {
				"${lines.join('\\n')}", -- [1]
			},
			["closed"] = ${closed},
			["id"] = "${serverTime}-${index + 1}",
			["lines"] = ${lines.length},
			["startedAt"] = ${serverTime},
		}, -- [${index + 1}]`;
	});
	return `
${prefix}DB = {
	["format"] = 1,
	["character"] = {
		["guid"] = "${guid}",
		["name"] = "${name}",
		["realm"] = "Steamwheedle Cartel",
		["region"] = ${region},
		["classID"] = 6,
		["raceID"] = 10,
	},
	["sessions"] = {
${containers.join('\n')}
	},
}
${prefix}UI = {
	["icon"] = { ["x"] = 10 },
}
`;
}

interface KeptOnSite {
	sharing: Sharing;
	/** serverTime to the SHA-256 of the session's fixed form. */
	sessions: Map<number, string>;
	done: number;
}

/** The site, as far as the uploader can tell. */
export class FakeSite {
	readonly origin = 'https://site.test';
	/** Characters the site turns away the first time they are sent, by GUID, with its reason. */
	turnAway = new Map<string, string>();
	kept = new Map<string, KeptOnSite>();
	/** Characters their player removed on the site: when, and the sessions deleted with them. */
	removed = new Map<string, { at: number; sessions: Set<number> }>();
	addonVersion = '0.2.24';
	/** The site can't be reached. */
	down = false;
	/** Sessions are answered with the site's error page: a 500 that isn't JSON. */
	brokenStore = false;
	/** The next `done` fails. */
	failDone = false;
	/** Where the class icons are, as the site says; null when it has none. */
	classIcons: string | null = 'https://art.test/classes';
	/** What a kept character's card shows, by GUID, over the site's usual answer. */
	cards = new Map<string, Record<string, unknown>>();
	/** Whether the site says which Battle.net account a link is for, as the real one does now. */
	saysWhich = true;
	/** Who approves the next link: the player unless a test says another account does. */
	approver: { battletag: string; battlenetId: string } = OWNER;
	requests: string[] = [];
	/** Sessions sent under a character that didn't play them, by their time, which it set aside. */
	setAside: number[] = [];
	/** Every plan the uploader asked for, as it was sent. */
	plans: { guid: string; sharing?: Sharing; fresh?: boolean }[] = [];
	#links = new Map<string, { userCode: string; approved: boolean }>();
	/** Each token the site handed out, and the account it is for. */
	#tokens = new Map<string, { battletag: string; battlenetId: string }>();
	#serial = 0;

	/** The tokens handed out and still good, in order. */
	get tokens(): string[] {
		return [...this.#tokens.keys()];
	}

	/** The player approves a short code on the site's page. */
	approve(userCode: string): void {
		for (const link of this.#links.values()) if (link.userCode === userCode) link.approved = true;
	}

	/** The player unlinks every computer from the library. */
	unlinkAll(): void {
		this.#tokens.clear();
	}

	/** The player keeps a character from the browser, as its pages would. */
	keep(guid: string, sharing: Sharing): void {
		this.removed.delete(guid);
		this.kept.set(guid, { sharing, sessions: new Map(), done: 0 });
	}

	/** The player removes a character on the site: it and its sessions are deleted, and noted. */
	remove(guid: string, at = Date.parse('2026-10-05T21:00:00Z')): void {
		const kept = this.kept.get(guid);
		this.kept.delete(guid);
		this.removed.set(guid, { at, sessions: new Set(kept?.sessions.keys() ?? []) });
	}

	fetch: Fetch = async (url, init = {}) => {
		const { pathname, searchParams } = new URL(url);
		const method = init.method ?? 'GET';
		this.requests.push(`${method} ${pathname}`);
		if (this.down) throw new Error('offline');
		const answer = (status: number, body: unknown) => ({
			status,
			ok: status >= 200 && status < 300,
			json: async () => body
		});
		const json = () => JSON.parse(typeof init.body === 'string' ? init.body : '{}');
		const bearerOf = () => /^Bearer (.+)$/.exec(init.headers?.authorization ?? '')?.[1] ?? null;
		/** The account the request's token is for, or null when it has none the site knows. */
		const linked = () => {
			const bearer = bearerOf();
			return bearer === null ? null : (this.#tokens.get(bearer) ?? null);
		};

		if (method === 'POST' && pathname === '/api/device/link') {
			const serial = ++this.#serial;
			const deviceCode = `device-${serial}`;
			const userCode = `CODE-${String(serial).padStart(4, '0')}`;
			this.#links.set(deviceCode, { userCode, approved: false });
			return answer(200, {
				ok: true,
				deviceCode,
				userCode,
				verifyUrl: `${this.origin}/link?code=${userCode}`,
				expiresIn: 600,
				interval: 3
			});
		}
		if (method === 'POST' && pathname === '/api/device/token') {
			const link = this.#links.get(json().deviceCode);
			if (!link) return answer(200, { status: 'gone' });
			if (!link.approved) return answer(200, { status: 'waiting' });
			this.#links.delete(json().deviceCode);
			const token = `token-${++this.#serial}-padded-to-look-like-one`;
			const who = this.approver;
			this.#tokens.set(token, who);
			return answer(200, {
				status: 'linked',
				token,
				battletag: who.battletag,
				battlenetId: this.saysWhich ? who.battlenetId : undefined
			});
		}
		if (pathname === '/api/device/me') {
			const who = linked();
			if (!who) return answer(401, { ok: false, reason: 'unlinked' });
			if (method === 'DELETE') {
				this.#tokens.delete(bearerOf() ?? '');
				return answer(200, { ok: true });
			}
			return answer(200, {
				ok: true,
				battletag: who.battletag,
				battlenetId: this.saysWhich ? who.battlenetId : undefined,
				kept: [...this.kept].map(([guid, kept]) => ({
					guid,
					sharing: kept.sharing,
					name: null,
					realm: null,
					sessions: kept.sessions.size,
					classID: 6,
					raceID: 10,
					race: 'Blood Elf',
					level: 12,
					playedMs: 3600000 * kept.sessions.size,
					lastPlayedMs: null,
					sittings: kept.sessions.size,
					game: 'retail',
					mode: 'retail',
					modeLabel: 'Retail',
					...this.cards.get(guid)
				})),
				listed: [],
				addon: { version: this.addonVersion, file: '/downloads/addon.zip', sha256: 'x' },
				art: { classIcons: this.classIcons }
			});
		}
		if (method === 'POST' && pathname === '/api/uploads/plan') {
			if (!linked()) return answer(401, { ok: false, reason: 'signed-out' });
			const plan = json() as {
				guid: string;
				sharing?: Sharing;
				fresh?: boolean;
				sessions: { serverTime: number; digest: string }[];
			};
			this.plans.push({ guid: plan.guid, sharing: plan.sharing, fresh: plan.fresh });
			let kept = this.kept.get(plan.guid);
			const removed = this.removed.get(plan.guid);
			if (!kept) {
				if (!plan.sharing) return answer(409, { ok: false, reason: 'undecided' });
				// Removed by its player: only their own choice just now brings it back, whole.
				if (removed && !plan.fresh) {
					return answer(409, {
						ok: false,
						reason: 'removed',
						removedAt: new Date(removed.at).toISOString()
					});
				}
				const reason = this.turnAway.get(plan.guid);
				if (reason) return answer(403, { ok: false, reason });
				this.removed.delete(plan.guid);
				kept = { sharing: plan.sharing, sessions: new Map(), done: 0 };
				this.kept.set(plan.guid, kept);
			}
			const stored = kept.sessions;
			const deleted = this.removed.get(plan.guid)?.sessions ?? new Set<number>();
			return answer(200, {
				ok: true,
				sharing: kept.sharing,
				send: plan.sessions
					.filter((s) => !deleted.has(s.serverTime) && stored.get(s.serverTime) !== s.digest)
					.map((s) => s.serverTime)
			});
		}
		if (method === 'PUT' && pathname === '/api/uploads/session') {
			if (!linked()) return answer(401, { ok: false, message: 'Sign in first.' });
			const kept = this.kept.get(searchParams.get('guid') ?? '');
			if (!kept) return answer(403, { ok: false, message: 'That character isn’t yours.' });
			if (this.brokenStore) {
				return {
					status: 500,
					ok: false,
					json: async () => {
						throw new SyntaxError('Unexpected token <');
					}
				};
			}
			const text = gunzipSync(init.body as Uint8Array).toString('utf8');
			// A session another character played (its SESSION line names another GUID) is set aside.
			const player = text.slice(text.indexOf('\n\n') + 2).split('\n')[0]?.split('\t')[11];
			if (player && player !== searchParams.get('guid')) {
				this.setAside.push(Number(searchParams.get('serverTime')));
				return answer(200, { ok: true, result: 'refused' });
			}
			const digest = createHash('sha256').update(text, 'utf8').digest('hex');
			kept.sessions.set(Number(searchParams.get('serverTime')), digest);
			return answer(200, { ok: true, result: 'stored' });
		}
		if (method === 'POST' && pathname === '/api/uploads/done') {
			if (!linked()) return answer(401, {});
			if (this.failDone) {
				this.failDone = false;
				return answer(500, {});
			}
			const kept = this.kept.get(json().guid);
			if (kept) kept.done++;
			return answer(200, { ok: true, entries: 0 });
		}
		return answer(404, {});
	};
}

/** The computer: files, a clock, a keychain, a notification tray, a browser. */
export class FakeHost implements Host {
	readonly server: string;
	fetch: Fetch;
	clock = Date.parse('2026-10-05T20:00:00Z');
	installs = ['E:\\World of Warcraft'];
	files = new Map<string, { text: string; modified: number }>();
	addonsFound: AddonFound[] = [{ flavor: '_retail_', version: '0.2.24' }];
	/** The credential store: a token per key (the site's address, or that and an account's ID). */
	tokens = new Map<string, string>();
	/** The one token of a computer with one link, as most tests mean. */
	get token(): string | null {
		return [...this.tokens.values()][0] ?? null;
	}
	set token(value: string | null) {
		this.tokens.clear();
		if (value !== null) this.tokens.set(this.server, value);
	}
	state: string | null = null;
	notices: string[] = [];
	opened: string[] = [];
	reads: string[] = [];
	/** What happens when the browser is opened: by default the player approves the link. */
	onOpen: (url: string) => void;

	constructor(site: FakeSite) {
		this.server = site.origin;
		this.fetch = site.fetch;
		this.onOpen = (url) => site.approve(new URL(url).searchParams.get('code') ?? '');
	}

	tools = {
		gzip: async (text: string) => new Uint8Array(gzipSync(text)) as Uint8Array<ArrayBuffer>,
		sha256: async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
	};

	/**
	 * Writes a character's recording, as the game does when the player logs out; `file` is
	 * WoWJourney.lua for one the addon wrote under its earlier name.
	 */
	save(
		character: string,
		text: string,
		flavor = '_retail_',
		file = 'Widsith.lua',
		account = `${OWNER.battlenetId}#1`
	): string {
		const path = `E:\\World of Warcraft\\${flavor}\\WTF\\Account\\${account}\\Realm\\${character}\\SavedVariables\\${file}`;
		this.files.set(path, { text, modified: this.clock });
		return path;
	}

	/** Time passes. */
	wait(ms: number): void {
		this.clock += ms;
	}

	findInstalls = async () => this.installs;
	scan = async (root: string): Promise<FoundFile[]> =>
		[...this.files]
			.filter(([path]) => path.startsWith(root))
			.map(([path, file]) => {
				const parts = path.split('\\');
				return {
					path,
					flavor: parts[2],
					account: parts[5],
					realm: parts[6],
					character: parts[7],
					modified: file.modified,
					size: file.text.length
				};
			});
	read = async (path: string) => {
		this.reads.push(path);
		const file = this.files.get(path);
		if (!file) throw new Error('gone');
		return file.text;
	};
	addons = async () => this.addonsFound;
	secret = {
		get: async (key: string) => this.tokens.get(key) ?? null,
		set: async (key: string, value: string) => void this.tokens.set(key, value),
		clear: async (key: string) => void this.tokens.delete(key)
	};
	loadState = async () => this.state;
	saveState = async (json: string) => void (this.state = json);
	computerName = async () => 'DESKTOP-TEST';
	open = async (url: string) => {
		this.opened.push(url);
		this.onOpen(url);
	};
	notify = async (title: string, body: string) => void this.notices.push(`${title}: ${body}`);
	now = () => this.clock;
	sleep = async (ms: number) => {
		this.clock += ms;
		await Promise.resolve();
	};
	/** The default browser's name, and how many times it was asked for. */
	browserName: string | null = 'Chrome';
	browserAsks = 0;
	/** Set to undefined for a computer that can't say which browser it opens links in. */
	browser?: () => Promise<string | null> = async () => {
		this.browserAsks++;
		return this.browserName;
	};
	/** The app's own updates. Left out unless a test gives the computer some. */
	updates?: FakeUpdates;
}

/**
 * The app's updates on the made-up computer: the site's feed offers `offered` (or nothing), a
 * download and an install can be made to fail, and a download can be held part-way until the test
 * lets it finish.
 */
export class FakeUpdates {
	offered: { version: string; notes: string | null } | null = null;
	feedDown = false;
	failDownload = false;
	failInstall = false;
	checks = 0;
	downloads = 0;
	/** Each install, by whether the new version was to show its window. */
	installs: boolean[] = [];
	/** Set while a download is held: call it to let the download finish. */
	release: (() => void) | null = null;
	hold = false;

	check = async () => {
		this.checks++;
		if (this.feedDown) throw new Error('offline');
		return this.offered;
	};
	download = async (onProgress: (done: number, total: number | null) => void) => {
		this.downloads++;
		onProgress(500, 1000);
		if (this.hold) await new Promise<void>((resolve) => (this.release = resolve));
		this.release = null;
		if (this.failDownload) throw new Error('signature mismatch');
		onProgress(1000, 1000);
	};
	install = async (show: boolean) => {
		if (this.failInstall) throw new Error('installer would not start');
		this.installs.push(show);
	};
}
