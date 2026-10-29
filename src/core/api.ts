// Everything the uploader says to the site, in one place. Seven requests:
//   linking:   POST /api/device/link, POST /api/device/token
//   who am I:  GET /api/device/me, DELETE /api/device/me
//   sending:   POST /api/uploads/plan, PUT /api/uploads/session, POST /api/uploads/done
// Nothing else is ever sent, and nothing goes anywhere but the one server named here.

import type { Game } from './sessions.ts';

export type Sharing = 'private' | 'public';

/** The part of `fetch` this needs, so tests can stand in for the network. */
export type Fetch = (
	url: string,
	init?: {
		method?: string;
		headers?: Record<string, string>;
		body?: string | Uint8Array<ArrayBuffer>;
	}
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

/** The site no longer knows this computer: it was unlinked there, or never linked. */
export class Unlinked extends Error {
	constructor() {
		super('This computer is no longer linked.');
		this.name = 'Unlinked';
	}
}

export interface LinkStarted {
	deviceCode: string;
	userCode: string;
	verifyUrl: string;
	/** Seconds until the codes run out. */
	expiresIn: number;
	/** Seconds to wait between asking whether it was approved. */
	interval: number;
}

export type LinkAnswer =
	| { status: 'waiting' }
	| { status: 'gone' }
	| {
			status: 'linked';
			token: string;
			battletag: string | null;
			/** The account's Battle.net ID, which names its folder under the game's WTF/Account. */
			battlenetId: string | null;
	  };

/** A character the account keeps on the site, and how. Anything the site doesn't say is null. */
export interface Kept {
	guid: string;
	sharing: Sharing;
	name: string | null;
	realm: string | null;
	sessions: number;
	classID: number | null;
	raceID: number | null;
	/** The race's name, as the site writes it. */
	race: string | null;
	level: number | null;
	/** Time played, and when it was last played, in ms. */
	playedMs: number | null;
	lastPlayedMs: number | null;
	/** How many times the character was played, as the site counts them. */
	sittings: number | null;
	game: Game | null;
	/**
	 * Where the site ranks the character among others (a game, its beta, a hardcore realm), as a
	 * key and by name.
	 */
	mode: string | null;
	modeLabel: string | null;
	/**
	 * Whether Battle.net lists the character on the account. True when the site doesn't say, as an
	 * older one didn't.
	 */
	verified: boolean;
	/**
	 * The character's page, as a path from the site's root (`/character/us/steamwheedle-cartel/sevra`);
	 * null when the site doesn't say. `#sharing` after it opens the choice of who sees it.
	 */
	href: string | null;
	/** The game's own /played at the end of the recording, in ms; `playedMs` is the time recorded. */
	gamePlayedMs: number | null;
}

export interface Me {
	battletag: string | null;
	/** The account's Battle.net ID, which names its folder under the game's WTF/Account. */
	battlenetId: string | null;
	kept: Kept[];
	/** The characters Battle.net lists on the account. */
	listed: { region: string; characterId: number; name: string; realm: string }[];
	/** The newest addon the site hands out. */
	addon: { version: string; file: string; sha256: string };
	/** Where the game's class icons are: `<classIcons>/<classID>.png` is one class's. */
	art: { classIcons: string | null };
}

const numberOr = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;
const textOr = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** A Battle.net ID as the site sends it: a string of digits, or a number from an older site. */
const idOr = (value: unknown): string | null => {
	if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
	return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
};
const GAMES: readonly Game[] = ['forever', 'retail', 'classic'];
const gameOr = (value: unknown): Game | null =>
	GAMES.includes(value as Game) ? (value as Game) : null;

/** One kept character as the site described it, or null when it names none. */
function keptOf(value: unknown): Kept | null {
	if (value === null || typeof value !== 'object') return null;
	const kept = value as Record<string, unknown>;
	if (typeof kept.guid !== 'string') return null;
	return {
		guid: kept.guid,
		sharing: kept.sharing === 'public' ? 'public' : 'private',
		name: textOr(kept.name),
		realm: textOr(kept.realm),
		sessions: numberOr(kept.sessions) ?? 0,
		classID: numberOr(kept.classID),
		raceID: numberOr(kept.raceID),
		race: textOr(kept.race),
		level: numberOr(kept.level),
		playedMs: numberOr(kept.playedMs),
		lastPlayedMs: numberOr(kept.lastPlayedMs),
		sittings: numberOr(kept.sittings),
		game: gameOr(kept.game),
		mode: textOr(kept.mode),
		modeLabel: textOr(kept.modeLabel),
		verified: kept.verified !== false,
		href: typeof kept.href === 'string' && kept.href.startsWith('/') ? kept.href : null,
		gamePlayedMs: numberOr(kept.gamePlayedMs)
	};
}

export interface PlanRequest {
	guid: string;
	info: Record<string, unknown>;
	format: number | null;
	/** Only the first time, with the player's choice. Afterwards the site's setting stands. */
	sharing?: Sharing;
	fresh?: boolean;
	sessions: { serverTime: number; digest: string }[];
}

export type PlanAnswer =
	| { ok: true; sharing: Sharing; send: number[] }
	/** `removedAt`: when the player removed the character on the site (ms), for `removed`. */
	| { ok: false; reason: string; removedAt: number | null };

/** An answer's body as an object; empty when it isn't JSON (the site's error page, a proxy's). */
async function bodyOf(response: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
	try {
		const body = await response.json();
		return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export class Api {
	readonly server: string;
	#fetch: Fetch;
	#token: () => string | null;

	constructor(server: string, fetch: Fetch, token: () => string | null) {
		this.server = server.replace(/\/+$/, '');
		this.#fetch = fetch;
		this.#token = token;
	}

	#headers(extra: Record<string, string> = {}): Record<string, string> {
		const token = this.#token();
		return token ? { ...extra, authorization: `Bearer ${token}` } : extra;
	}

	async startLink(name: string): Promise<LinkStarted> {
		const response = await this.#fetch(`${this.server}/api/device/link`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		const body = (await bodyOf(response)) as Partial<LinkStarted>;
		if (!response.ok || !body.deviceCode || !body.userCode || !body.verifyUrl) {
			throw new Error('The site couldn’t start linking just now.');
		}
		return {
			deviceCode: body.deviceCode,
			userCode: body.userCode,
			verifyUrl: body.verifyUrl,
			expiresIn: body.expiresIn ?? 600,
			interval: body.interval ?? 3
		};
	}

	async askLink(deviceCode: string): Promise<LinkAnswer> {
		const response = await this.#fetch(`${this.server}/api/device/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ deviceCode })
		});
		const body = await bodyOf(response);
		if (body.status === 'linked' && typeof body.token === 'string') {
			return {
				status: 'linked',
				token: body.token,
				battletag: textOr(body.battletag),
				battlenetId: idOr(body.battlenetId)
			};
		}
		// A failing site isn't a refusal: keep waiting until the link itself runs out.
		if (!response.ok) throw new Error('The site didn’t answer.');
		return { status: body.status === 'waiting' ? 'waiting' : 'gone' };
	}

	async me(): Promise<Me> {
		const response = await this.#fetch(`${this.server}/api/device/me`, {
			headers: this.#headers({ accept: 'application/json' })
		});
		if (response.status === 401) throw new Unlinked();
		const body = (await bodyOf(response)) as Partial<Record<keyof Me, unknown>> & { ok?: boolean };
		if (!response.ok || !body.ok || !body.addon) throw new Error('The site didn’t answer.');
		const art = (body.art ?? {}) as Record<string, unknown>;
		return {
			battletag: textOr(body.battletag),
			battlenetId: idOr(body.battlenetId),
			kept: (Array.isArray(body.kept) ? body.kept : [])
				.map(keptOf)
				.filter((kept): kept is Kept => kept !== null),
			listed: Array.isArray(body.listed) ? (body.listed as Me['listed']) : [],
			addon: body.addon as Me['addon'],
			art: { classIcons: textOr(art.classIcons) }
		};
	}

	async unlink(): Promise<void> {
		await this.#fetch(`${this.server}/api/device/me`, {
			method: 'DELETE',
			headers: this.#headers()
		});
	}

	async plan(plan: PlanRequest): Promise<PlanAnswer> {
		const response = await this.#fetch(`${this.server}/api/uploads/plan`, {
			method: 'POST',
			headers: this.#headers({ 'content-type': 'application/json' }),
			body: JSON.stringify(plan)
		});
		if (response.status === 401) throw new Unlinked();
		const body = await bodyOf(response);
		if (body.ok === true && Array.isArray(body.send)) {
			return {
				ok: true,
				sharing: body.sharing === 'public' ? 'public' : 'private',
				send: body.send.filter((time): time is number => typeof time === 'number')
			};
		}
		const removedAt = typeof body.removedAt === 'string' ? Date.parse(body.removedAt) : NaN;
		return {
			ok: false,
			reason: typeof body.reason === 'string' ? body.reason : 'failed',
			removedAt: Number.isFinite(removedAt) ? removedAt : null
		};
	}

	/** One session, gzipped. `result` is the site's word: stored, same, grown, refused, deleted. */
	async putSession(
		guid: string,
		serverTime: number,
		gz: Uint8Array<ArrayBuffer>
	): Promise<{ ok: true; result: string } | { ok: false; status: number; message: string }> {
		const response = await this.#fetch(
			`${this.server}/api/uploads/session?guid=${encodeURIComponent(guid)}&serverTime=${serverTime}`,
			{
				method: 'PUT',
				headers: this.#headers({ 'content-type': 'application/gzip' }),
				body: gz
			}
		);
		if (response.status === 401) throw new Unlinked();
		const body = await bodyOf(response);
		if (body.ok === true) {
			return { ok: true, result: typeof body.result === 'string' ? body.result : 'stored' };
		}
		// The site's own refusals say why. Anything else is the site failing, not the session. The
		// status tells a refusal of this one session (413, too large) from the site failing.
		return {
			ok: false,
			status: response.status,
			message:
				body.ok === false && typeof body.message === 'string'
					? body.message
					: 'The site couldn’t take a session just now. It will be tried again.'
		};
	}

	/** All sent: the site works out the character's runs and what its shelf shows. */
	async done(guid: string): Promise<boolean> {
		const response = await this.#fetch(`${this.server}/api/uploads/done`, {
			method: 'POST',
			headers: this.#headers({ 'content-type': 'application/json' }),
			body: JSON.stringify({ guid })
		});
		if (response.status === 401) throw new Unlinked();
		return response.ok;
	}
}
