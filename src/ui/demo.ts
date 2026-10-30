// A fake controller with made-up characters, so the window can be worked on in a plain browser
// (`npm run dev:web`) without the app, the game or the site. Pick a state with `?demo=` (greeting,
// new, linking, setup, linked, paused, empty, update; `&state=downloading|failed` for update).
//
// Pemba (Retail) and Brannoc (Forever) are both unverified; only Pemba should show the notice.

import type { CharacterView, View } from '../core/engine.ts';
import type { Controller, Shell } from './controller.ts';

const now = Date.now();
const HOUR = 3600000;
const DAY = 24 * HOUR;

/** The player, and another account that plays on the same computer (`?demo=accounts`). */
const WANDERER = { id: '12345678', battletag: 'Wanderer#1234' };
const OTHER = { id: '87654321' };

/** The site's class icons, as it hands them to a linked computer. */
const ICONS = 'https://aap4obmj7p3arvth.public.blob.vercel-storage.com/class-icons/v1';

const FOREVER = { flavor: '_forever_', game: 'forever', gameLabel: 'WoW Forever' } as const;
const RETAIL = { flavor: '_retail_', game: 'retail', gameLabel: 'Retail' } as const;

function character(partial: Partial<CharacterView> & { name: string }): CharacterView {
	return {
		key: partial.name,
		guid: `Player-1-${partial.name}`,
		realm: 'Steamwheedle Cartel',
		flavor: '_retail_',
		account: WANDERER.id,
		earlier: false,
		former: false,
		sessions: 12,
		status: 'kept',
		sharing: null,
		upToDate: true,
		progress: null,
		sentAt: null,
		removedAt: null,
		message: null,
		pageUrl: null,
		verified: null,
		classID: null,
		raceID: null,
		race: null,
		region: 1,
		level: null,
		playedMs: null,
		gamePlayedMs: null,
		lastPlayedMs: null,
		sittings: null,
		savedAt: now - 7 * DAY,
		game: 'retail',
		gameLabel: 'Retail',
		firstSeen: now - 30 * DAY,
		isNew: false,
		sentSinceLooked: false,
		...partial,
		classIcon:
			partial.classIcon ??
			(partial.classID !== undefined && partial.classID !== null
				? `${ICONS}/${partial.classID}.png`
				: null)
	};
}

/** What the site says of a character it keeps, and the file that the game last wrote then. */
function kept(
	name: string,
	level: number,
	race: string,
	playedHours: number,
	lastPlayed: number,
	verified = true
) {
	return {
		level,
		race,
		playedMs: Math.round(playedHours * HOUR),
		gamePlayedMs: Math.round(playedHours * 1.1 * HOUR),
		lastPlayedMs: lastPlayed,
		savedAt: lastPlayed,
		pageUrl: `https://widsith.app/character/us/steamwheedle-cartel/${name.toLowerCase()}`,
		verified
	};
}

const CHARACTERS: CharacterView[] = [
	character({ name: 'Nibbles', realm: 'Nagafen', classID: 3, sessions: 0, status: 'new', isNew: true, level: null, playedMs: null, lastPlayedMs: null }),
	character({
		...FOREVER,
		name: 'Aldwin',
		realm: 'Nagafen',
		classID: 3,
		sessions: 34,
		status: 'new',
		upToDate: false,
		isNew: true,
		firstSeen: now - 2 * HOUR,
		savedAt: now - 2 * HOUR
	}),
	character({
		...FOREVER,
		name: 'Squashed',
		realm: 'Gorefiend',
		classID: 4,
		sessions: 1,
		status: 'refused',
		upToDate: false,
		savedAt: now - 4 * DAY,
		message: 'Another account already keeps this character.'
	}),
	character({
		...FOREVER,
		name: 'Kaden',
		classID: 9,
		sessions: 6,
		status: 'removed',
		upToDate: false,
		removedAt: now - 2 * DAY,
		savedAt: now - 5 * DAY
	}),
	character({
		...FOREVER,
		name: 'Sevra',
		classID: 2,
		sharing: 'public',
		sentAt: now - 40 * 60000,
		sentSinceLooked: true,
		sittings: 41,
		...kept('Sevra', 31, 'Dwarf', 52.9, now - 50 * 60000)
	}),
	character({
		...FOREVER,
		name: 'Thistlewen',
		classID: 11,
		sharing: 'public',
		sentAt: now - 3 * DAY,
		sittings: 9,
		...kept('Thistlewen', 12, 'Night Elf', 12.87, now - 3 * DAY)
	}),
	character({
		...FOREVER,
		name: 'Brannoc',
		classID: 1,
		sharing: 'private',
		sentAt: now - DAY,
		sittings: 22,
		...kept('Brannoc', 24, 'Human', 31.2, now - DAY, false)
	}),
	character({
		...FOREVER,
		name: 'Sarovin',
		realm: 'Kirin Tor',
		classID: 7,
		status: 'sending',
		sharing: 'private',
		upToDate: false,
		progress: { sent: 3, total: 12 },
		sentAt: now - 6 * DAY,
		...kept('Sarovin', 19, 'Tauren', 20.5, now - 10 * 60000)
	}),
	character({
		...FOREVER,
		name: 'Averil',
		classID: 5,
		sharing: 'private',
		upToDate: false,
		sentAt: now - 26 * HOUR,
		message: 'The site couldn’t be reached. It will be tried again.',
		...kept('Averil', 17, 'Human', 9.4, now - 2 * HOUR)
	}),
	character({
		...FOREVER,
		name: 'Velkis',
		classID: 9,
		sharing: 'private',
		upToDate: false,
		sentAt: now - 9 * DAY,
		...kept('Velkis', 40, 'Orc', 77.1, now - HOUR)
	}),
	character({
		...FOREVER,
		name: 'Corvane',
		realm: 'Nagafen',
		classID: 8,
		status: 'waiting',
		upToDate: false,
		savedAt: now - 3 * HOUR
	}),
	character({
		...RETAIL,
		name: 'Morrowgrim',
		classID: 6,
		sharing: 'public',
		sentAt: now - 14 * DAY,
		sittings: 160,
		...kept('Morrowgrim', 80, 'Undead', 412.3, now - 14 * DAY)
	}),
	character({
		...RETAIL,
		name: 'Pemba',
		classID: 10,
		sharing: 'private',
		sentAt: now - 30 * DAY,
		...kept('Pemba', 52, 'Pandaren', 61, now - 30 * DAY, false)
	}),
	character({
		...RETAIL,
		name: 'Ashkarra',
		classID: 12,
		sharing: 'private',
		earlier: true,
		sentAt: now - 120 * DAY,
		...kept('Ashkarra', 70, 'Blood Elf', 140.6, now - 120 * DAY)
	}),
	character({
		...RETAIL,
		name: 'Quorvyn',
		classID: 13,
		sessions: 2,
		status: 'skipped',
		upToDate: false,
		savedAt: now - 20 * DAY
	}),
	// Earlier characters: deleted in the game, their names taken by newer ones whose files still
	// hold their sessions. Pemba's predecessor was never sent, so it is off until switched on;
	// Morrowgrim's was kept before it was deleted, so it stays kept.
	character({
		...RETAIL,
		key: 'Pemba#Player-1-EARLIER1',
		guid: 'Player-1-EARLIER1',
		name: 'Pemba',
		former: true,
		sessions: 9,
		status: 'skipped',
		upToDate: false,
		savedAt: now - 200 * DAY
	}),
	character({
		...RETAIL,
		key: 'Morrowgrim#Player-1-EARLIER2',
		guid: 'Player-1-EARLIER2',
		name: 'Morrowgrim',
		former: true,
		classID: 4,
		sharing: 'private',
		sentAt: now - 300 * DAY,
		...kept('Morrowgrim', 34, 'Gnome', 40.2, now - 300 * DAY)
	})
];

/** The other account's characters: found here, sent nowhere until it is linked. */
const OTHERS: CharacterView[] = [
	character({
		...FOREVER,
		name: 'Morrigane',
		realm: 'Nagafen',
		classID: 9,
		account: OTHER.id,
		sessions: 18,
		status: 'unlinked',
		upToDate: false,
		firstSeen: now - 20 * 60000,
		isNew: true
	}),
	character({
		...RETAIL,
		name: 'Pellinor',
		classID: 2,
		account: OTHER.id,
		sessions: 4,
		status: 'unlinked',
		upToDate: false,
		firstSeen: now - 20 * 60000,
		isNew: true
	})
];

const BASE: View = {
	ready: true,
	linked: true,
	battletag: WANDERER.battletag,
	accounts: [
		{
			id: WANDERER.id,
			linked: true,
			battletag: WANDERER.battletag,
			started: true,
			lastPlayedAt: now - 50 * 60000,
			characters: CHARACTERS.length,
			isNew: true,
			sentSinceLooked: true,
			online: true
		}
	],
	links: [
		{
			id: WANDERER.id,
			battletag: WANDERER.battletag,
			started: true,
			hasRecordings: true,
			lastSentAt: now - 40 * 60000
		}
	],
	linking: null,
	notice: null,
	online: true,
	roots: ['E:\\World of Warcraft', 'D:\\Games\\World of Warcraft Forever'],
	manualRoots: ['D:\\Games\\World of Warcraft Forever'],
	characters: CHARACTERS,
	addon: {
		state: 'outdated',
		installed: [
			{ flavor: '_retail_', version: '0.4.0' },
			{ flavor: '_forever_', version: '0.4.1' }
		],
		latest: '0.4.1'
	},
	greeting: false,
	setup: null,
	lookedAt: now - 3 * HOUR,
	lastSentAt: now - 40 * 60000,
	paused: false,
	browser: 'Chrome',
	update: null
};

const UPDATE_STATE = new URLSearchParams(location.search).get('state');

const VIEWS: Record<string, View> = {
	linked: BASE,
	update: {
		...BASE,
		update: {
			version: '0.2.1',
			notes: 'Widsith Uploader 0.2.1.',
			state: UPDATE_STATE === 'downloading' || UPDATE_STATE === 'failed' ? UPDATE_STATE : 'ready',
			progress: UPDATE_STATE === 'downloading' ? 0.4 : null,
			message:
				UPDATE_STATE === 'failed'
					? 'Version 0.2.1 couldn’t be downloaded. The app will try again later.'
					: null
		}
	},
	paused: {
		...BASE,
		paused: true,
		// Nothing is sent while paused, so nothing is part-way through.
		characters: CHARACTERS.map((c) =>
			c.status === 'sending' ? { ...c, status: 'kept' as const, progress: null } : c
		)
	},
	setup: {
		...BASE,
		setup: WANDERER.id,
		accounts: BASE.accounts.map((a) => ({ ...a, started: false })),
		links: BASE.links.map((l) => ({ ...l, started: false })),
		// Before the start nothing the account doesn't keep has gone anywhere.
		characters: CHARACTERS.map((c) =>
			c.status === 'new' || c.status === 'refused'
				? { ...c, status: 'unstarted' as const, message: null }
				: c.status === 'sending'
					? { ...c, status: 'kept' as const, progress: null }
					: c
		)
	},
	// A second account plays on this computer and isn't linked: its characters are found and
	// shown, and nothing of theirs is sent.
	accounts: {
		...BASE,
		characters: [...CHARACTERS, ...OTHERS],
		accounts: [
			{
				id: OTHER.id,
				linked: false,
				battletag: null,
				started: false,
				lastPlayedAt: now - 20 * 60000,
				characters: OTHERS.length,
				isNew: true,
				sentSinceLooked: false,
				online: true
			},
			...BASE.accounts
		]
	},
	new: {
		...BASE,
		linked: false,
		battletag: null,
		lastSentAt: null,
		accounts: BASE.accounts.map((a) => ({
			...a,
			linked: false,
			battletag: null,
			started: false,
			isNew: false,
			sentSinceLooked: false
		})),
		links: [],
		characters: CHARACTERS.map((c) => ({
			...c,
			status: 'unlinked' as const,
			sharing: null,
			progress: null,
			message: null,
			pageUrl: null,
			verified: null,
			sentAt: null,
			isNew: false,
			sentSinceLooked: false
		})),
		addon: { ...BASE.addon, state: 'unknown', latest: null }
	},
	linking: {
		...BASE,
		linked: false,
		battletag: null,
		linking: {
			userCode: 'KQ7M-2XPD',
			verifyUrl: 'https://widsith.app/link?code=KQ7M-2XPD',
			opened: new URLSearchParams(location.search).get('opened') !== '0'
		},
		characters: [],
		accounts: [],
		links: [],
		addon: { ...BASE.addon, state: 'unknown', latest: null }
	},
	empty: {
		...BASE,
		roots: [],
		manualRoots: [],
		characters: [],
		accounts: [],
		lastSentAt: null,
		addon: { state: 'missing', installed: [], latest: '0.4.1' }
	}
};

// A new install: the greeting, and behind it the window as it is before linking.
VIEWS.greeting = { ...VIEWS.new, greeting: true };

export function demo(): { controller: Controller; shell: Shell } {
	const name = new URLSearchParams(location.search).get('demo') ?? 'linked';
	let view = VIEWS[name] ?? BASE;
	const listeners = new Set<(view: View) => void>();
	const change = (next: View) => {
		view = next;
		for (const listener of listeners) listener(view);
	};
	const changeOne = (key: string, patch: Partial<CharacterView>) =>
		change({
			...view,
			characters: view.characters.map((c) => (c.key === key ? { ...c, ...patch } : c))
		});
	const nothing = async () => {};
	return {
		controller: {
			subscribe(listener) {
				listeners.add(listener);
				listener(view);
				return () => listeners.delete(listener);
			},
			link: nothing,
			reopenLink: nothing,
			cancelLink: () => {},
			async greet() {
				change({ ...view, greeting: false });
			},
			unlink: nothing,
			async setUploading(key, on) {
				const was = view.characters.find((c) => c.key === key);
				if (!was) return;
				if (!on) changeOne(key, { status: 'skipped', message: null });
				else {
					// Kept again if the site keeps it; else waiting for the start, or on its way.
					const waiting = view.setup ? ('unstarted' as const) : ('new' as const);
					changeOne(key, { status: was.sharing ? 'kept' : waiting, removedAt: null });
				}
			},
			addRoot: nothing,
			removeRoot: nothing,
			sendNow: nothing,
			async setPaused(on) {
				change({ ...view, paused: on });
			},
			async beginUploading(id) {
				const of = id ?? view.setup ?? WANDERER.id;
				change({
					...view,
					setup: null,
					accounts: view.accounts.map((a) => (a.id === of ? { ...a, started: true } : a)),
					links: view.links.map((l) => (l.id === of ? { ...l, started: true } : l)),
					characters: view.characters.map((c) =>
						c.status === 'unstarted' ? { ...c, status: 'new' as const } : c
					)
				});
			},
			looked: nothing,
			left: () => {},
			async installUpdate() {
				// The real app ends here and the new version starts; the made-up one only says so.
				if (view.update?.state === 'ready') {
					change({ ...view, update: { ...view.update, state: 'installing' } });
				}
			}
		},
		shell: {
			server: 'https://widsith.app',
			open: () => {},
			copy: async (text) => {
				await navigator.clipboard.writeText(text).catch(() => {});
				return true;
			},
			pickFolder: async () => ({ root: null, picked: false }),
			startsWithWindows: async () => true,
			setStartsWithWindows: nothing,
			openTaskbarSettings: () => {}
		}
	};
}
