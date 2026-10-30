import { describe, expect, it } from 'vitest';
import { TIMING } from '../src/core/config.ts';
import { Engine, isEarlierFile } from '../src/core/engine.ts';
import {
	AVERIL,
	FakeHost,
	FakeSite,
	FakeUpdates,
	GUEST,
	OWNER,
	recording,
	SEVRA
} from './fakes.ts';

const T = 1789990000;
const MINUTE = 60000;

/** A computer with Sevra's recording saved a minute ago, and the site. */
function setup() {
	const site = new FakeSite();
	const host = new FakeHost(site);
	const path = host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3]]));
	host.wait(MINUTE);
	const engine = new Engine(host);
	return { site, host, engine, path };
}

/** Sevra's computer with Averil's recording beside hers. */
function two() {
	const made = setup();
	const other = made.host.save('Averil', recording(AVERIL, 'Averil', [[T + 100, 2]]));
	made.host.wait(MINUTE);
	return { ...made, other };
}

/** The same, linked, with the link's own bookkeeping out of the way. */
async function linked<Made extends ReturnType<typeof setup>>(made: Made = setup() as Made) {
	await made.engine.start();
	await made.engine.link();
	await waitFor(() => made.engine.view.linked);
	await made.engine.tick();
	return made;
}

/** The same, started: every character it has is sent as Private. */
async function started<Made extends ReturnType<typeof setup>>(made: Made = setup() as Made) {
	const done = await linked(made);
	await done.engine.beginUploading();
	return done;
}

const row = (engine: Engine, name: string) => {
	const found = engine.view.characters.find((c) => c.name === name);
	if (!found) throw new Error(`no row for ${name}`);
	return found;
};

async function waitFor(condition: () => boolean): Promise<void> {
	for (let i = 0; i < 2000; i++) {
		if (condition()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error('never happened');
}

const sent = (site: FakeSite) => site.requests.filter((r) => r.startsWith('PUT ')).length;

describe('the greeting', () => {
	it('is shown by a new install, and not again once the player is past it', async () => {
		const { engine, host } = setup();
		await engine.start();
		expect(engine.view.greeting).toBe(true);
		await engine.greet();
		expect(engine.view.greeting).toBe(false);
		const again = new Engine(host);
		await again.start();
		expect(again.view.greeting).toBe(false);
	});

	it('isn’t shown to a player whose app was set up before there was one', async () => {
		const { host } = await started();
		const saved = JSON.parse(host.state ?? '{}');
		delete saved.greeted;
		host.state = JSON.stringify(saved);
		const again = new Engine(host);
		await again.start();
		expect(again.view.greeting).toBe(false);
	});

	it('isn’t shown before what was remembered is read', () => {
		const { engine } = setup();
		expect(engine.view.greeting).toBe(false);
	});
});

describe('before this computer is linked', () => {
	it('finds the recordings and says whose they are, and asks the site nothing', async () => {
		const { engine, site } = setup();
		await engine.start();
		expect(engine.view).toMatchObject({ ready: true, linked: false });
		expect(engine.view.characters).toMatchObject([
			{ name: 'Sevra', realm: 'Steamwheedle Cartel', sessions: 1, status: 'unlinked', guid: SEVRA }
		]);
		expect(site.requests).toEqual([]);
	});

	it('leaves alone a file the game may still be writing', async () => {
		const { engine, host } = setup();
		host.save('Averil', recording(AVERIL, 'Averil', [[T, 1]]));
		await engine.start();
		expect(engine.view.characters.map((c) => c.status)).toEqual(['reading', 'unlinked']);
		host.wait(TIMING.settle + 1);
		await engine.tick();
		expect(engine.view.characters.map((c) => c.status)).toEqual(['unlinked', 'unlinked']);
	});

	it('reads a file once, not on every look', async () => {
		const { engine, host } = setup();
		await engine.start();
		await engine.tick();
		await engine.tick();
		expect(host.reads).toHaveLength(1);
	});

	it('says so when a file isn’t a recording, once it has had time to be finished', async () => {
		const { engine, host } = setup();
		host.save('Broken', 'WidsithDB = {');
		host.wait(TIMING.settle + 1);
		await engine.start();
		// Fresh and unreadable: most likely half-written.
		expect(engine.view.characters[0]).toMatchObject({ name: 'Broken', status: 'reading' });
		host.wait(TIMING.unreadableAfter);
		await engine.tick();
		expect(engine.view.characters[0]).toMatchObject({ status: 'unreadable' });
		expect(engine.view.characters[0].message).toBeTruthy();
	});
});

describe('linking', () => {
	it('opens the site with a code, and is linked once the player approves it there', async () => {
		const { engine, host, site } = setup();
		host.onOpen = () => {};
		await engine.start();
		await engine.link();
		expect(host.opened).toEqual(['https://site.test/link?code=CODE-0001']);
		expect(engine.view.linking).toEqual({
			userCode: 'CODE-0001',
			verifyUrl: 'https://site.test/link?code=CODE-0001',
			opened: true
		});
		expect(engine.view.linked).toBe(false);
		site.approve('CODE-0001');
		await waitFor(() => engine.view.linked);
		expect(engine.view).toMatchObject({ linked: true, linking: null, battletag: 'Owner#1' });
		expect(host.token).toMatch(/^token-/);
	});

	it('can leave the browser alone, for a player who wants the link for another one', async () => {
		const { engine, host, site } = setup();
		host.onOpen = () => {};
		await engine.start();
		await engine.link(false);
		expect(host.opened).toEqual([]);
		expect(engine.view.linking).toMatchObject({
			verifyUrl: 'https://site.test/link?code=CODE-0001',
			opened: false
		});
		// They can still have it opened here after all.
		await engine.reopenLink();
		expect(host.opened).toEqual(['https://site.test/link?code=CODE-0001']);
		expect(engine.view.linking).toMatchObject({ opened: true });
		// Approved in whichever browser, it links the same.
		site.approve('CODE-0001');
		await waitFor(() => engine.view.linked);
	});

	it('starts one link, however many times it is asked at once', async () => {
		const { engine, host, site } = setup();
		host.onOpen = () => {};
		await engine.start();
		await Promise.all([engine.link(), engine.link(), engine.link(false)]);
		expect(host.opened).toHaveLength(1);
		expect(site.requests.filter((r) => r === 'POST /api/device/link')).toHaveLength(1);
		engine.cancelLink();
	});

	it('gives up when the link runs out, and says nothing was linked', async () => {
		const { engine, host } = setup();
		host.onOpen = () => {};
		await engine.start();
		await engine.link();
		await waitFor(() => engine.view.linking === null);
		expect(engine.view.linked).toBe(false);
		expect(engine.view.notice).toMatch(/ran out/);
	});

	it('can be cancelled', async () => {
		const { engine, host, site } = setup();
		host.onOpen = () => {};
		await engine.start();
		await engine.link();
		engine.cancelLink();
		site.approve('CODE-0001');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(engine.view).toMatchObject({ linked: false, linking: null, notice: null });
	});

	it('says so when the site can’t be reached', async () => {
		const { engine, site } = setup();
		await engine.start();
		site.down = true;
		await engine.link();
		expect(engine.view.linking).toBeNull();
		expect(engine.view.notice).toMatch(/couldn’t be reached/);
	});

	it('is remembered the next time the app starts', async () => {
		const { host } = await linked();
		const again = new Engine(host);
		await again.start();
		expect(again.view).toMatchObject({ linked: true, battletag: 'Owner#1' });
	});
});

describe('before uploading is started', () => {
	it('sends nothing, and shows the start', async () => {
		const { engine, site, host } = await linked();
		expect(engine.view.setup).toBe(OWNER.battlenetId);
		expect(engine.view.characters[0]).toMatchObject({ status: 'unstarted', sharing: null });
		host.wait(TIMING.account + 1);
		await engine.tick();
		await engine.sendNow();
		expect(site.plans).toEqual([]);
		expect(site.kept.size).toBe(0);
	});

	it('starting sends every character as Private, and the ones played later the same way', async () => {
		const { engine, site, host } = await linked(two());
		await engine.beginUploading();
		expect(engine.view.setup).toBeNull();
		expect(site.kept.get(SEVRA)).toMatchObject({ sharing: 'private', done: 1 });
		expect(site.kept.get(AVERIL)).toMatchObject({ sharing: 'private', done: 1 });
		expect(engine.view.characters.map((c) => c.status)).toEqual(['kept', 'kept']);
		expect(row(engine, 'Sevra')).toMatchObject({
			sharing: 'private',
			upToDate: true,
			pageUrl: `https://site.test/character/${SEVRA}`
		});

		// One found later goes the same way, without asking.
		const TARN = 'Player-1071-0DAAAAAA';
		host.save('Tarn', recording(TARN, 'Tarn', [[T + 9000, 1]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(site.kept.get(TARN)).toMatchObject({ sharing: 'private', done: 1 });

		// Never Public, and never bringing back what a player deleted.
		const first = site.plans.filter((plan) => plan.sharing !== undefined);
		expect(first.map((plan) => plan.guid).sort()).toEqual([AVERIL, SEVRA, TARN].sort());
		expect(first.every((plan) => plan.sharing === 'private' && plan.fresh === false)).toBe(true);
		// Sending is quiet.
		expect(host.notices).toEqual([]);
	});

	it('a character switched off before the start stays here, and the rest go', async () => {
		const { engine, site, other } = await linked(two());
		await engine.setUploading(other, false);
		expect(row(engine, 'Averil')).toMatchObject({ status: 'skipped' });
		expect(site.plans).toEqual([]);
		await engine.beginUploading();
		expect(site.kept.has(SEVRA)).toBe(true);
		expect(site.kept.has(AVERIL)).toBe(false);
		expect(row(engine, 'Averil')).toMatchObject({ status: 'skipped' });
	});

	it('is shown again after the computer is unlinked and linked again', async () => {
		const { engine, site } = await started();
		const plans = site.plans.length;
		await engine.unlink();
		expect(engine.view).toMatchObject({ linked: false, setup: null });
		await engine.link();
		await waitFor(() => engine.view.linked);
		await engine.tick();
		expect(engine.view.setup).toBe(OWNER.battlenetId);
		// The character it sent before is kept by the site, so it is shown as kept meanwhile.
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept' });
		expect(site.plans).toHaveLength(plans);
	});
});

describe('a character switched off', () => {
	it('stays where it is, whatever the site keeps, until it is switched on again', async () => {
		const { engine, site, host, path } = await started();
		expect(sent(site)).toBe(1);
		await engine.setUploading(path, false);
		expect(engine.view.characters[0]).toMatchObject({ status: 'skipped' });
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.tick();
		await engine.sendNow();
		expect(sent(site)).toBe(1);

		// The choice survives a restart.
		const again = new Engine(host);
		await again.start();
		expect(again.view.characters[0]).toMatchObject({ status: 'skipped' });

		await again.setUploading(path, true);
		expect(sent(site)).toBe(2);
		expect(again.view.characters[0]).toMatchObject({ status: 'kept', upToDate: true });
	});
});

describe('a character turned away by the site', () => {
	it('says why, is told once, and is tried again now and then', async () => {
		const { engine, site, host } = await linked();
		site.turnAway.set(SEVRA, 'kept-elsewhere');
		await engine.beginUploading();
		expect(engine.view.characters[0]).toMatchObject({ status: 'refused' });
		expect(engine.view.characters[0].message).toMatch(/Another account already keeps/);
		expect(site.kept.size).toBe(0);
		expect(host.notices).toEqual([
			'Sevra: Another account already keeps this character.'
		]);

		await engine.tick();
		expect(site.plans).toHaveLength(1);
		host.wait(TIMING.turnedAway + 1);
		await engine.tick();
		expect(site.plans).toHaveLength(2);
		expect(host.notices).toHaveLength(1);

		// Switched off, it stops being tried; switched on, it is tried at once.
		const path = engine.view.characters[0].key;
		await engine.setUploading(path, false);
		host.wait(TIMING.turnedAway + 1);
		await engine.tick();
		expect(site.plans).toHaveLength(2);
		site.turnAway.delete(SEVRA);
		await engine.setUploading(path, true);
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept', message: null });
	});

	it.each(['not-on-account', 'private-only', 'toString'])(
		'for a reason it doesn’t know (%s), is a failure tried again soon, never a refusal',
		async (reason) => {
			const { engine, site, host } = await linked();
			// An older site's answers: one for a character Battle.net didn't list, one for a test realm.
			site.turnAway.set(SEVRA, reason);
			await engine.beginUploading();
			const card = engine.view.characters[0];
			expect(card.status).toBe('new');
			expect(card.message).toBe('The site couldn’t take it just now. It will be tried again.');
			expect(card.message ?? '').not.toMatch(/sign (in|out)/i);
			expect(host.notices).toEqual([]);

			// Tried again after the usual wait for a failure, not the hour a refusal waits.
			await engine.tick();
			expect(site.plans).toHaveLength(1);
			site.turnAway.delete(SEVRA);
			host.wait(TIMING.retry + 1);
			await engine.tick();
			expect(site.plans).toHaveLength(2);
			expect(engine.view.characters[0]).toMatchObject({ status: 'kept', message: null });
			expect(host.notices).toEqual([]);
		}
	);
});

describe('a kept character’s card', () => {
	it('links to its page by the address the site gives, and says whether it is verified', async () => {
		const { engine, site } = await started();
		site.cards.set(SEVRA, {
			verified: false,
			href: '/character/us/steamwheedle-cartel/sevra',
			gamePlayedMs: 7200000
		});
		await engine.sendNow();
		expect(engine.view.characters[0]).toMatchObject({
			status: 'kept',
			pageUrl: 'https://site.test/character/us/steamwheedle-cartel/sevra',
			verified: false,
			gamePlayedMs: 7200000,
			playedMs: 3600000
		});
		site.cards.set(SEVRA, { verified: true, href: '/character/us/steamwheedle-cartel/sevra' });
		await engine.sendNow();
		expect(engine.view.characters[0]).toMatchObject({ verified: true, gamePlayedMs: null });
	});

	it('is named as the site names it, in full on WoW Forever, over the file’s name', async () => {
		const { engine, site } = await started();
		expect(engine.view.characters[0].name).toBe('Sevra');
		site.cards.set(SEVRA, { name: 'Sevra Ashvale' });
		await engine.sendNow();
		expect(engine.view.characters[0].name).toBe('Sevra Ashvale');
	});

	it('from an older site that says neither, is taken as verified, at its GUID’s address', async () => {
		const { engine } = await started();
		expect(engine.view.characters[0]).toMatchObject({
			verified: true,
			pageUrl: `https://site.test/character/${SEVRA}`,
			gamePlayedMs: null
		});
	});

	it('takes no address that isn’t a path on the site', async () => {
		const { engine, site } = await started();
		site.cards.set(SEVRA, { href: 'evil.test/character' });
		await engine.sendNow();
		expect(engine.view.characters[0].pageUrl).toBe(`https://site.test/character/${SEVRA}`);
	});

	it('says nothing of verification or its page until the site keeps it', async () => {
		const { engine } = await linked();
		expect(engine.view.characters[0]).toMatchObject({
			status: 'unstarted',
			verified: null,
			pageUrl: null
		});
	});

	it('knows when the game last wrote its file, apart from the site’s last play', async () => {
		const { engine, host, path } = await started();
		expect(engine.view.characters[0].savedAt).toBe(host.files.get(path)?.modified);
		expect(engine.view.characters[0].lastPlayedMs).toBeNull();
	});
});

describe('an earlier character in a file', () => {
	// Sevra was deleted in the game and made again with the same name: the game kept her file, so
	// it holds the old Sevra's two sessions as well as the new one's.
	const OLD = 'Player-1071-00000OLD';
	function remade() {
		const site = new FakeSite();
		const host = new FakeHost(site);
		const path = host.save(
			'Sevra',
			recording(SEVRA, 'Sevra', [
				[T, 2, true, OLD],
				[T + 900, 1, true, OLD],
				[T + 5000, 3]
			])
		);
		host.wait(MINUTE);
		return { site, host, engine: new Engine(host), path };
	}
	const byKey = (engine: Engine, key: string) => {
		const found = engine.view.characters.find((c) => c.key === key);
		if (!found) throw new Error(`no row for ${key}`);
		return found;
	};

	it('is a row of its own, off, and the newer character is sent without its sessions', async () => {
		const { engine, site, host, path } = await started(remade());
		const key = `${path}#${OLD}`;
		expect(engine.view.characters.map((c) => [c.key, c.guid, c.former, c.status, c.sessions])).toEqual([
			[path, SEVRA, false, 'kept', 1],
			[key, OLD, true, 'skipped', 2]
		]);
		// Its class isn't in the file, whose table is the new Sevra's.
		expect(byKey(engine, key)).toMatchObject({ name: 'Sevra', classID: null, upToDate: false });
		expect([...(site.kept.get(SEVRA)?.sessions.keys() ?? [])]).toEqual([T + 5000]);
		expect(site.setAside).toEqual([]);
		expect(site.plans.map((plan) => plan.guid)).toEqual([SEVRA]);

		// Off, it is never sent.
		host.wait(TIMING.account + 1);
		await engine.sendNow();
		expect(site.kept.has(OLD)).toBe(false);

		// Switched on, it goes up as a character of its own, Private, with its own sessions alone.
		await engine.setUploading(key, true);
		expect(site.kept.get(OLD)).toMatchObject({ sharing: 'private', done: 1 });
		expect([...(site.kept.get(OLD)?.sessions.keys() ?? [])].sort()).toEqual([T, T + 900]);
		expect(site.setAside).toEqual([]);
		expect(byKey(engine, key)).toMatchObject({ status: 'kept', upToDate: true });
		expect(byKey(engine, path)).toMatchObject({ status: 'kept', upToDate: true });

		// Remembered across a restart, and nothing is sent twice.
		const before = sent(site);
		const again = new Engine(host);
		await again.start();
		expect(byKey(again, key)).toMatchObject({ status: 'kept', upToDate: true });
		expect(sent(site)).toBe(before);
		const saved = JSON.parse(host.state ?? '{}');
		expect(saved).toMatchObject({ version: 5, earlierOn: [OLD] });
		expect(saved.files[path].earlier[OLD]).toMatchObject({
			sessions: 2,
			sentModified: saved.files[path].modified,
			lastStartedAt: (T + 900) * 1000
		});

		// Switched off again, it stays here.
		await again.setUploading(key, false);
		expect(byKey(again, key)).toMatchObject({ status: 'skipped' });
		expect(JSON.parse(host.state ?? '{}').earlierOn).toEqual([]);
	});

	it('kept by the site already, sent before it was deleted, stays on', async () => {
		const made = remade();
		made.site.keep(OLD, 'public');
		const { engine, site, path } = await started(made);
		expect(byKey(engine, `${path}#${OLD}`)).toMatchObject({
			former: true,
			status: 'kept',
			sharing: 'public',
			upToDate: true
		});
		expect([...(site.kept.get(OLD)?.sessions.keys() ?? [])].sort()).toEqual([T, T + 900]);
		expect([...(site.kept.get(SEVRA)?.sessions.keys() ?? [])]).toEqual([T + 5000]);
		expect(site.setAside).toEqual([]);
	});

	it('is found in a file read before the app told them apart, by reading it once more', async () => {
		const { engine, host, site, path } = await started(remade());
		await engine.unlink();
		const saved = JSON.parse(host.state ?? '{}');
		delete saved.files[path].earlier;
		delete saved.earlierOn;
		host.state = JSON.stringify({ ...saved, version: 4 });
		const reads = host.reads.length;
		const again = new Engine(host);
		await again.start();
		expect(host.reads).toHaveLength(reads + 1);
		expect(again.view.characters.map((c) => [c.key, c.status])).toEqual([
			[path, 'unlinked'],
			[`${path}#${OLD}`, 'skipped']
		]);
		expect(site.kept.has(OLD)).toBe(false);
	});
});

describe('a character removed on the site', () => {
	it('is left alone, said so, and comes back whole when switched on again', async () => {
		const { engine, site, host, path } = await started();
		site.remove(SEVRA);
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.sendNow();
		await engine.sendNow();
		expect(engine.view.characters[0]).toMatchObject({
			status: 'removed',
			removedAt: Date.parse('2026-10-05T21:00:00Z'),
			message: null
		});
		expect(site.kept.size).toBe(0);
		// The player's own act: nothing is notified.
		expect(host.notices).toEqual([]);

		// Asked once; after that the app remembers what the site said.
		const asked = site.plans.length;
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2], [T + 9000, 1]]));
		host.wait(MINUTE);
		await engine.sendNow();
		expect(site.plans).toHaveLength(asked);

		// Switched on again: the player's choice, so everything comes back, the deleted session too.
		await engine.setUploading(path, true);
		expect(site.plans.at(-1)).toMatchObject({ guid: SEVRA, sharing: 'private', fresh: true });
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(3);
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept', removedAt: null });

		// Later sends are ordinary ones again.
		host.save(
			'Sevra',
			recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2], [T + 9000, 1], [T + 12000, 1]])
		);
		host.wait(MINUTE);
		await engine.tick();
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(4);
		expect(site.plans.filter((plan) => plan.fresh)).toHaveLength(1);
	});

	it('is no longer removed once the site keeps it again, brought from the browser', async () => {
		const { engine, site, host } = await started();
		site.remove(SEVRA);
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.sendNow();
		expect(engine.view.characters[0]).toMatchObject({ status: 'removed' });
		site.keep(SEVRA, 'public');
		await engine.sendNow();
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept', sharing: 'public' });
		expect(JSON.parse(host.state ?? '{}').removed).toEqual({});
	});
});

describe('a kept character', () => {
	it('sends only what is new each time the game saves', async () => {
		const { engine, site, host } = await started();
		expect(sent(site)).toBe(1);

		// Nothing changed: nothing asked.
		const before = site.requests.length;
		await engine.tick();
		expect(site.requests.length).toBe(before);

		// The player logs out again: one more session in the file.
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(sent(site)).toBe(2);
		expect(site.kept.get(SEVRA)).toMatchObject({ done: 2 });
		expect(host.notices).toEqual([]);
	});

	it('sends the file the addon wrote under its earlier name too, marked as the older one', async () => {
		const { engine, site, host, path } = await linked();
		const earlier = recording(SEVRA, 'Sevra', [[T - 90000, 2]], 1, true);
		const older = host.save('Sevra', earlier, '_retail_', 'WoWJourney.lua');
		host.wait(MINUTE);
		await engine.tick();
		await engine.beginUploading();
		await engine.tick();
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(2);
		const rows = engine.view.characters;
		expect(rows.find((c) => c.key === older)).toMatchObject({ earlier: true, status: 'kept' });
		expect(rows.find((c) => c.key === path)).toMatchObject({ earlier: false, status: 'kept' });
		expect(isEarlierFile('E:\\X\\SavedVariables\\wowjourney.lua')).toBe(true);
		expect(isEarlierFile('E:\\X\\SavedVariables\\Widsith.lua')).toBe(false);
	});

	it('sends an open session again once it has grown', async () => {
		const { engine, site, host } = await linked();
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3, false]]));
		host.wait(MINUTE);
		await engine.tick();
		await engine.beginUploading();
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 9, true]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(sent(site)).toBe(2);
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(1);
	});

	it('kept from the browser is sent as the site keeps it, even before the start', async () => {
		const { engine, site, host } = setup();
		site.keep(SEVRA, 'public');
		await engine.start();
		await engine.link();
		await waitFor(() => engine.view.characters[0]?.status === 'kept');
		await engine.tick();
		expect(engine.view.characters[0]).toMatchObject({ sharing: 'public', upToDate: true });
		expect(sent(site)).toBe(1);
		expect(host.notices).toEqual([]);
	});

	it('is tried again later when the site can’t be reached, and no sooner', async () => {
		const { engine, site, host } = await started();
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		site.down = true;
		await engine.tick();
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept', upToDate: false });
		expect(engine.view.characters[0].message).toMatch(/tried again/);
		site.down = false;
		const before = site.requests.length;
		await engine.tick();
		expect(site.requests.length).toBe(before);
		host.wait(TIMING.retry + 1);
		await engine.tick();
		expect(engine.view.characters[0]).toMatchObject({ upToDate: true, message: null });
		expect(sent(site)).toBe(2);
	});

	it('says the site failed, not the session, when the site answers with an error page', async () => {
		const { engine, site, host } = await linked();
		site.brokenStore = true;
		await engine.beginUploading();
		// The next look learns that the site keeps it now, and waits before sending again.
		await engine.tick();
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept', upToDate: false });
		expect(engine.view.characters[0].message).toMatch(/couldn’t take a session just now/);
		site.brokenStore = false;
		host.wait(TIMING.retry + 1);
		await engine.tick();
		expect(engine.view.characters[0]).toMatchObject({ upToDate: true, message: null });
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(1);
	});

	it('leaves out a session the site calls too large, sends the rest, and tries it again only once it has grown', async () => {
		const { engine, site, host } = await started();
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2], [T + 9000, 4]]));
		site.tooLarge.add(T + 5000);
		const doneBefore = site.kept.get(SEVRA)?.done ?? 0;
		host.wait(MINUTE);
		await engine.tick();
		// The other two went and the site finished reading; the card says one stays here.
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(2);
		expect(site.kept.get(SEVRA)?.done).toBe(doneBefore + 1);
		expect(engine.view.characters[0]).toMatchObject({ status: 'kept', upToDate: true });
		expect(engine.view.characters[0].message).toMatch(/One session is too large/);
		// Nothing is asked or sent again while the file is as it was.
		const before = site.requests.length;
		host.wait(TIMING.retryMax + 1);
		await engine.tick();
		expect(site.requests.length).toBe(before);
		// The file changes elsewhere: the large session, unchanged, isn't packed and sent again.
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2], [T + 9000, 4], [T + 12000, 1]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(3);
		expect(engine.view.characters[0].message).toMatch(/One session is too large/);
		// Grown, it is tried once more; the site takes it now.
		site.tooLarge.delete(T + 5000);
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 6], [T + 9000, 4], [T + 12000, 1]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(site.kept.get(SEVRA)?.sessions.size).toBe(4);
		expect(engine.view.characters[0]).toMatchObject({ upToDate: true, message: null });
	});

	it('finishes later when the sessions went up but the site never read them', async () => {
		const { engine, site, host } = await linked();
		site.failDone = true;
		await engine.beginUploading();
		expect(site.kept.get(SEVRA)).toMatchObject({ done: 0 });
		expect(engine.view.characters[0]).toMatchObject({ upToDate: false });
		host.wait(TIMING.retry + 1);
		await engine.tick();
		expect(site.kept.get(SEVRA)).toMatchObject({ done: 1 });
		expect(engine.view.characters[0]).toMatchObject({ upToDate: true });
		// Nothing was sent twice.
		expect(sent(site)).toBe(1);
	});
});

describe('unlinking', () => {
	it('from the app gives up the token, and sends nothing afterwards', async () => {
		const { engine, site, host } = await started();
		await engine.unlink();
		expect(host.token).toBeNull();
		expect(engine.view).toMatchObject({ linked: false, battletag: null });
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(sent(site)).toBe(1);
		expect(engine.view.characters[0]).toMatchObject({ status: 'unlinked' });
	});

	it('from the site is noticed, said plainly, and the token thrown away', async () => {
		const { engine, site, host } = await started();
		site.unlinkAll();
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(engine.view.linked).toBe(false);
		expect(engine.view.notice).toMatch(/was unlinked/);
		expect(host.token).toBeNull();
	});
});

describe('the addon', () => {
	it('is called missing, out of date or current', async () => {
		const { engine, host, site } = await linked();
		expect(engine.view.addon).toMatchObject({ state: 'current', latest: '0.2.24' });

		host.addonsFound = [{ flavor: '_retail_', version: '0.2.9' }];
		await engine.sendNow();
		expect(engine.view.addon.state).toBe('outdated');

		// Newer than the site knows (a build still being tried) is not out of date.
		site.addonVersion = '0.2.8';
		await engine.sendNow();
		expect(engine.view.addon.state).toBe('current');

		host.addonsFound = [];
		await engine.sendNow();
		expect(engine.view.addon.state).toBe('missing');
	});
});

describe('game folders', () => {
	it('can be added by hand when the search finds none', async () => {
		const site = new FakeSite();
		const host = new FakeHost(site);
		host.installs = [];
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3]]));
		host.wait(MINUTE);
		const engine = new Engine(host);
		await engine.start();
		expect(engine.view).toMatchObject({ roots: [], characters: [] });
		await engine.addRoot('E:\\World of Warcraft');
		expect(engine.view.roots).toEqual(['E:\\World of Warcraft']);
		expect(engine.view.characters).toHaveLength(1);
		await engine.removeRoot('E:\\World of Warcraft');
		expect(engine.view.characters).toHaveLength(0);
	});
});

describe('a state file from an earlier version', () => {
	it('keeps what it knew, reads each file once more, and shows the start', async () => {
		const { host, engine, path, site } = await started();
		await engine.addRoot('F:\\Games\\World of Warcraft');
		const now = JSON.parse(host.state ?? '{}');
		const files = Object.fromEntries(
			Object.entries(now.files as Record<string, Record<string, unknown>>).map(([key, record]) => {
				const { classID, raceID, region, game, ...earlier } = record;
				return [key, earlier];
			})
		);
		host.state = JSON.stringify({
			version: 1,
			manualRoots: now.manualRoots,
			skipped: [AVERIL],
			files,
			battletag: 'Owner#1'
		});
		// The earlier version kept its one token under the site's address alone.
		host.token = host.token;
		const reads = host.reads.length;

		const again = new Engine(host);
		await again.start();
		// The site says whose the token is, and the link is kept under that account from then on.
		expect(again.view).toMatchObject({ linked: true, setup: OWNER.battlenetId });
		expect([...host.tokens.keys()]).toEqual([`${host.server}|${OWNER.battlenetId}`]);
		expect(again.view.roots).toContain('F:\\Games\\World of Warcraft');
		expect(host.reads).toHaveLength(reads + 1);
		expect(again.view.characters[0]).toMatchObject({
			status: 'kept',
			upToDate: true,
			game: 'retail',
			classID: 6,
			isNew: false,
			sentSinceLooked: false
		});
		expect(sent(site)).toBe(1);
		const saved = JSON.parse(host.state ?? '{}');
		expect(saved).toMatchObject({
			version: 5,
			skipped: [AVERIL],
			removed: {},
			manualRoots: ['F:\\Games\\World of Warcraft'],
			links: { [OWNER.battlenetId]: { battletag: 'Owner#1', started: false } },
			pendingLink: null,
			told: []
		});
		expect(saved).not.toHaveProperty('keptOnce');
		expect(saved.files[path]).toMatchObject({ game: 'retail', classID: 6 });
		expect(saved.files[path].sentModified).toBe(saved.files[path].modified);
	});

	it('sends what it once sent elsewhere, and asks nothing, when new characters went automatically', async () => {
		// A computer that tried a copy of the site before linking to the real one: the earlier
		// version remembered sending Averil, and took the site not keeping her to mean she was
		// removed there. The site says what was removed now, so she goes up.
		const { host, engine, site } = await started(two());
		site.kept.delete(AVERIL);
		const now = JSON.parse(host.state ?? '{}');
		host.state = JSON.stringify({
			...now,
			version: 3,
			links: { [OWNER.battlenetId]: { battletag: 'Owner#1', newCharacters: 'automatic' } },
			keptOnce: [SEVRA, AVERIL],
			removed: undefined,
			restored: undefined
		});
		const again = new Engine(host);
		await again.start();
		expect(again.view.setup).toBeNull();
		expect(site.kept.get(AVERIL)).toMatchObject({ sharing: 'private' });
		expect(row(again, 'Averil')).toMatchObject({ status: 'kept' });
		expect(JSON.parse(host.state ?? '{}')).toMatchObject({
			version: 5,
			links: { [OWNER.battlenetId]: { battletag: 'Owner#1', started: true } }
		});

		// One who chose to be asked about each sees the start once instead.
		host.state = JSON.stringify({
			...now,
			version: 3,
			links: { [OWNER.battlenetId]: { battletag: 'Owner#1', newCharacters: 'ask' } }
		});
		const asked = new Engine(host);
		await asked.start();
		expect(asked.view.setup).toBe(OWNER.battlenetId);
	});
});

describe('what a card shows', () => {
	it('what the recording says until the site keeps the character, then what the site says', async () => {
		const site = new FakeSite();
		const host = new FakeHost(site);
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 1]]));
		const forever = { clientVersion: '1.60.0', projectID: 18 };
		host.save('Averil', recording(AVERIL, 'Averil', [[T, 1]], 90, false, forever));
		const classic = { clientVersion: '1.15.7', projectID: 2 };
		host.save('Brannoc', recording('Player-1-0000000B', 'Brannoc', [[T, 1]], 1, false, classic));
		const neither = { clientVersion: '', projectID: null };
		const unsaid = recording('Player-1-0000000C', 'Corra', [[T, 1]], 1, false, neither);
		host.save('Corra', unsaid, '_classic_era_');
		host.wait(MINUTE);
		const engine = new Engine(host);
		await engine.start();
		expect(row(engine, 'Sevra')).toMatchObject({ classIcon: null });
		await engine.link();
		await waitFor(() => engine.view.linked);
		await engine.tick();

		expect(row(engine, 'Sevra')).toMatchObject({
			game: 'retail',
			gameLabel: 'Retail',
			classID: 6,
			raceID: 10,
			region: 1,
			race: null,
			level: null,
			playedMs: null,
			sittings: null,
			classIcon: 'https://art.test/classes/6.png'
		});
		expect(row(engine, 'Averil')).toMatchObject({
			game: 'forever',
			gameLabel: 'WoW Forever',
			region: 90
		});
		expect(row(engine, 'Brannoc')).toMatchObject({ game: 'classic', gameLabel: 'Classic' });
		// Not even the recording says: the game folder's name.
		expect(row(engine, 'Corra')).toMatchObject({ game: null, gameLabel: 'Classic Era' });

		site.keep(SEVRA, 'public');
		site.cards.set(SEVRA, {
			game: 'forever',
			modeLabel: 'Forever Beta',
			level: 30,
			race: 'Orc',
			sittings: 4,
			playedMs: 7200000
		});
		await engine.sendNow();
		expect(row(engine, 'Sevra')).toMatchObject({
			status: 'kept',
			game: 'forever',
			gameLabel: 'Forever Beta',
			level: 30,
			race: 'Orc',
			sittings: 4,
			playedMs: 7200000
		});

		site.classIcons = null;
		await engine.sendNow();
		expect(row(engine, 'Sevra').classIcon).toBeNull();
	});

	it('says what is new and what was sent until the player looks', async () => {
		const { engine, host } = await linked();
		expect(engine.view).toMatchObject({ lookedAt: null, lastSentAt: null });
		expect(row(engine, 'Sevra')).toMatchObject({ isNew: true, sentSinceLooked: false });
		const firstSeen = row(engine, 'Sevra').firstSeen;
		expect(firstSeen !== null && firstSeen <= host.clock).toBe(true);
		await engine.beginUploading();
		expect(row(engine, 'Sevra')).toMatchObject({
			status: 'kept',
			isNew: true,
			sentSinceLooked: true
		});
		expect(engine.view.lastSentAt).toBe(host.clock);

		host.wait(1000);
		await engine.looked();
		expect(engine.view.lookedAt).toBe(host.clock);
		expect(row(engine, 'Sevra')).toMatchObject({ isNew: false, sentSinceLooked: false });

		// A character played here for the first time is new, and sent, until the next look.
		host.save('Averil', recording(AVERIL, 'Averil', [[T, 1]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(row(engine, 'Averil')).toMatchObject({
			status: 'kept',
			isNew: true,
			sentSinceLooked: true
		});
		await engine.looked();
		expect(row(engine, 'Averil')).toMatchObject({ isNew: false, sentSinceLooked: false });

		// What is sent after the look is marked again.
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.tick();
		expect(row(engine, 'Sevra')).toMatchObject({ isNew: false, sentSinceLooked: true });
	});
});

describe('notifications', () => {
	it('unlinked on the site is told once, and again after a new link; unlinking here is not', async () => {
		const { engine, site, host } = await started();
		site.unlinkAll();
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(MINUTE);
		await engine.tick();
		await engine.tick();
		expect(host.notices).toEqual([
			'Unlinked from Widsith: Owner#1 was unlinked from this computer on Widsith. Link it again to go on sending.'
		]);

		await engine.link();
		await waitFor(() => engine.view.linked);
		await engine.tick();
		site.unlinkAll();
		await engine.sendNow();
		expect(host.notices).toHaveLength(2);

		await engine.link();
		await waitFor(() => engine.view.linked);
		await engine.unlink();
		expect(host.notices).toHaveLength(2);
	});

	it('an addon older than the site’s is told once for each new version', async () => {
		const { engine, host, site } = await linked();
		host.addonsFound = [{ flavor: '_retail_', version: '0.2.9' }];
		await engine.sendNow();
		await engine.sendNow();
		expect(host.notices).toEqual([
			'A newer Widsith addon: Version 0.2.24 of the addon is out, and the copy in your game is older.'
		]);
		site.addonVersion = '0.2.25';
		await engine.sendNow();
		expect(host.notices).toHaveLength(2);
	});
});

describe('pausing', () => {
	it('stops sending and asking the site, but still reads what the game saves', async () => {
		const { engine, site, host } = await started();
		expect(sent(site)).toBe(1);
		await engine.setPaused(true);
		expect(engine.view.paused).toBe(true);
		const before = site.requests.length;
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(TIMING.account + 1);
		await engine.tick();
		await engine.sendNow();
		expect(site.requests.length).toBe(before);
		expect(row(engine, 'Sevra')).toMatchObject({ status: 'kept', sessions: 2, upToDate: false });

		// Resumed, it looks at once and sends what is owed.
		await engine.setPaused(false);
		expect(engine.view.paused).toBe(false);
		expect(sent(site)).toBe(2);
		expect(row(engine, 'Sevra')).toMatchObject({ upToDate: true });
	});

	it('takes the start and the switches meanwhile, and sends what they allow once resumed', async () => {
		const { engine, site, other } = await linked(two());
		await engine.setPaused(true);
		await engine.setUploading(other, false);
		await engine.beginUploading();
		expect(site.plans).toEqual([]);
		expect(engine.view.characters.map((c) => c.status)).toEqual(['skipped', 'new']);
		await engine.setPaused(false);
		expect(site.kept.get(SEVRA)).toMatchObject({ sharing: 'private', done: 1 });
		expect(site.kept.has(AVERIL)).toBe(false);
	});

	it('notifies nothing while paused, and tells what waits once resumed', async () => {
		const { engine, host } = await started();
		await engine.setPaused(true);
		host.save('Averil', recording(AVERIL, 'Averil', [[T, 1]]));
		host.addonsFound = [{ flavor: '_retail_', version: '0.2.9' }];
		host.wait(TIMING.account + 1);
		await engine.sendNow();
		expect(row(engine, 'Averil')).toMatchObject({ sessions: 1, status: 'new' });
		expect(host.notices).toEqual([]);
		await engine.setPaused(false);
		expect(host.notices).toEqual([
			'A newer Widsith addon: Version 0.2.24 of the addon is out, and the copy in your game is older.'
		]);
		expect(row(engine, 'Averil')).toMatchObject({ status: 'kept' });
	});

	it('is remembered the next time the app starts, and shown before the first look', async () => {
		const { engine, host, site } = await linked();
		await engine.setPaused(true);
		const before = site.requests.length;
		const again = new Engine(host);
		const seen: boolean[] = [];
		again.subscribe((view) => {
			if (!view.ready) seen.push(view.paused);
		});
		await again.start();
		expect(seen).toContain(true);
		expect(again.view.paused).toBe(true);
		expect(site.requests.length).toBe(before);

		// A state file written before there was a pause reads as not paused.
		const saved = JSON.parse(host.state ?? '{}');
		delete saved.paused;
		host.state = JSON.stringify(saved);
		const older = new Engine(host);
		await older.start();
		expect(older.view.paused).toBe(false);
	});
});

describe('the default browser', () => {
	it('is asked for once, when the app starts', async () => {
		const { engine, host } = await linked();
		await engine.tick();
		await engine.sendNow();
		expect(engine.view.browser).toBe('Chrome');
		expect(host.browserAsks).toBe(1);
	});

	it('is null when the computer can’t say', async () => {
		const { engine, host } = setup();
		host.browser = undefined;
		await engine.start();
		expect(engine.view.browser).toBeNull();

		const failing = setup();
		failing.host.browser = async () => {
			throw new Error('no such key');
		};
		await failing.engine.start();
		expect(failing.engine.view.browser).toBeNull();
	});
});

describe('updating the app', () => {
	const HOURS_6 = TIMING.updateEvery;

	/** Sevra's computer with an update to 0.2.1 on offer, started. */
	async function offered(made = setup()) {
		const updates = new FakeUpdates();
		updates.offered = { version: '0.2.1', notes: 'Widsith Uploader 0.2.1.' };
		made.host.updates = updates;
		await made.engine.start();
		return { ...made, updates };
	}

	/** The same, with the update found and downloaded. */
	async function ready(made = setup()) {
		const started = await offered(made);
		started.host.wait(TIMING.updateFirst);
		await started.engine.tick();
		expect(started.engine.view.update?.state).toBe('ready');
		return started;
	}

	it('is looked for half a minute after starting, and downloaded as soon as it is found', async () => {
		const { engine, host, updates } = await offered();
		await engine.tick();
		expect(updates.checks).toBe(0);
		expect(engine.view.update).toBeNull();

		host.wait(TIMING.updateFirst);
		updates.hold = true;
		const round = engine.tick();
		await waitFor(() => updates.release !== null);
		expect(engine.view.update).toEqual({
			version: '0.2.1',
			notes: 'Widsith Uploader 0.2.1.',
			state: 'downloading',
			progress: 0.5,
			message: null
		});
		updates.release?.();
		await round;
		expect(engine.view.update).toMatchObject({ state: 'ready', progress: null, message: null });
		expect(updates.downloads).toBe(1);
		// Just ready, and nobody asked: it waits.
		expect(updates.installs).toEqual([]);

		// Looked for again only every six hours, and the same version isn't fetched twice. (The
		// player has the window open, so the ready one doesn't go in by itself meanwhile.)
		await engine.tick();
		expect(updates.checks).toBe(1);
		host.wait(HOURS_6);
		await engine.looked();
		await engine.tick();
		expect(updates.checks).toBe(2);
		expect(updates.downloads).toBe(1);
	});

	it('goes in when the player asks, and the new version shows its window', async () => {
		const { engine, updates } = await ready();
		await engine.installUpdate();
		expect(updates.installs).toEqual([true]);
		expect(engine.view.update?.state).toBe('installing');
	});

	it('goes in by itself only once ready and left alone for ten minutes, staying in the tray', async () => {
		const { engine, host, updates } = await ready();
		host.wait(TIMING.updateIdle - 1000);
		await engine.tick();
		expect(updates.installs).toEqual([]);

		// The player opens the window and closes it again: ten more minutes from then.
		await engine.looked();
		engine.left();
		host.wait(5 * MINUTE);
		await engine.tick();
		expect(updates.installs).toEqual([]);
		host.wait(5 * MINUTE);
		await engine.tick();
		expect(updates.installs).toEqual([false]);
		expect(engine.view.update?.state).toBe('installing');
	});

	it('never goes in while a file is being sent', async () => {
		const made = setup();
		const updates = new FakeUpdates();
		updates.offered = { version: '0.2.1', notes: null };
		made.host.updates = updates;
		const { engine, host, site } = await linked(made);
		await engine.beginUploading();
		expect(sent(site)).toBe(1);
		host.wait(TIMING.updateFirst);
		await engine.tick();
		expect(engine.view.update?.state).toBe('ready');

		// The game saves more play, and the player asks for the update while it is being sent.
		const seen: { sending: boolean; sent: number }[] = [];
		updates.install = async () => {
			seen.push({
				sending: engine.view.characters.some((c) => c.status === 'sending'),
				sent: sent(site)
			});
		};
		host.save('Sevra', recording(SEVRA, 'Sevra', [[T, 3], [T + 5000, 2]]));
		host.wait(TIMING.settle + 1);
		await Promise.all([engine.tick(), engine.installUpdate()]);
		expect(seen).toEqual([{ sending: false, sent: 2 }]);
	});

	it('says when it couldn’t be downloaded, and tries again at the next check', async () => {
		const { engine, host, updates } = await offered();
		updates.failDownload = true;
		host.wait(TIMING.updateFirst);
		await engine.tick();
		expect(engine.view.update).toMatchObject({
			state: 'failed',
			message: 'Version 0.2.1 couldn’t be downloaded. The app will try again later.'
		});
		await engine.tick();
		expect(updates.downloads).toBe(1);
		// A failed update never goes in by itself.
		host.wait(TIMING.updateIdle);
		await engine.tick();
		expect(updates.installs).toEqual([]);

		updates.failDownload = false;
		host.wait(HOURS_6);
		await engine.tick();
		expect(updates.downloads).toBe(2);
		expect(engine.view.update).toMatchObject({ state: 'ready', message: null });
	});

	it('says when it couldn’t be installed, and tries again at the next check', async () => {
		const { engine, host, updates } = await ready();
		updates.failInstall = true;
		await engine.installUpdate();
		expect(engine.view.update).toMatchObject({
			state: 'failed',
			message: 'Version 0.2.1 couldn’t be installed. The app will try again later.'
		});
		updates.failInstall = false;
		host.wait(HOURS_6);
		await engine.tick();
		expect(engine.view.update?.state).toBe('ready');
		await engine.installUpdate();
		expect(updates.installs).toEqual([true]);
	});

	it('says nothing when the feed can’t be read, and asks again at the next check', async () => {
		const { engine, host, updates } = await offered();
		updates.feedDown = true;
		host.wait(TIMING.updateFirst);
		await engine.tick();
		expect(engine.view.update).toBeNull();
		updates.feedDown = false;
		host.wait(HOURS_6);
		await engine.tick();
		expect(engine.view.update?.state).toBe('ready');
	});

	it('isn’t looked for while uploading is paused, since the site is asked nothing', async () => {
		const { engine, host, updates } = await offered();
		await engine.setPaused(true);
		host.wait(TIMING.updateFirst);
		await engine.tick();
		expect(updates.checks).toBe(0);
		await engine.setPaused(false);
		expect(updates.checks).toBe(1);
		expect(engine.view.update?.state).toBe('ready');
	});

	it('does nothing on a computer that can’t update the app', async () => {
		const { engine, host } = setup();
		await engine.start();
		host.wait(TIMING.updateFirst);
		await engine.tick();
		await engine.installUpdate();
		expect(engine.view.update).toBeNull();
	});
});

describe('more than one account on the computer', () => {
	/** The player's recording beside a guest's, under the guest's own account folder. */
	function shared() {
		const made = setup();
		const guest = made.host.save(
			'Averil',
			recording(AVERIL, 'Averil', [[T + 100, 2]]),
			'_retail_',
			'Widsith.lua',
			`${GUEST.battlenetId}#1`
		);
		made.host.wait(MINUTE);
		return { ...made, guest };
	}

	it('sends only the linked account’s recordings, and tells of the other account once', async () => {
		const { engine, site, host, path, guest } = await linked(shared());
		await engine.beginUploading();
		expect(site.kept.get(SEVRA)).toMatchObject({ sharing: 'private' });
		expect(site.kept.has(AVERIL)).toBe(false);
		expect(engine.view.characters.map((c) => [c.key, c.account, c.status])).toEqual([
			[path, OWNER.battlenetId, 'kept'],
			[guest, GUEST.battlenetId, 'unlinked']
		]);
		// The account played most recently first.
		expect(engine.view.accounts).toMatchObject([
			{ id: GUEST.battlenetId, linked: false, battletag: null, characters: 1 },
			{ id: OWNER.battlenetId, linked: true, battletag: 'Owner#1', characters: 1 }
		]);
		expect(engine.view.links).toMatchObject([{ id: OWNER.battlenetId, hasRecordings: true }]);
		expect(host.notices).toEqual([
			'Another account plays on this computer: Link it in Widsith Uploader to send its recordings to Widsith. Until then nothing of its is sent.'
		]);
		await engine.tick();
		expect(host.notices).toHaveLength(1);
	});

	it('links the other account on its own, with its own start, and unlinks it alone', async () => {
		const { engine, site, host, path, guest } = await linked(shared());
		await engine.beginUploading();
		site.approver = GUEST;
		await engine.link();
		await waitFor(() => engine.view.links.length === 2);
		await engine.tick();
		expect(engine.view).toMatchObject({ setup: GUEST.battlenetId, battletag: null });
		expect(engine.view.links.map((l) => [l.id, l.battletag])).toEqual([
			[OWNER.battlenetId, 'Owner#1'],
			[GUEST.battlenetId, 'Guest#2']
		]);
		expect([...host.tokens.keys()].sort()).toEqual(
			[`${host.server}|${OWNER.battlenetId}`, `${host.server}|${GUEST.battlenetId}`].sort()
		);
		expect(engine.view.characters.find((c) => c.key === guest)).toMatchObject({
			status: 'unstarted',
			isNew: true
		});
		await engine.beginUploading(GUEST.battlenetId);
		expect(engine.view.setup).toBeNull();
		expect(site.kept.get(AVERIL)).toMatchObject({ sharing: 'private' });

		await engine.unlink(GUEST.battlenetId);
		expect(engine.view.links.map((l) => l.id)).toEqual([OWNER.battlenetId]);
		expect(engine.view.characters.find((c) => c.key === guest)).toMatchObject({ status: 'unlinked' });
		expect(engine.view.characters.find((c) => c.key === path)).toMatchObject({ status: 'kept' });
		expect([...host.tokens.keys()]).toEqual([`${host.server}|${OWNER.battlenetId}`]);
	});

	it('says so when the account linked is not one that plays here', async () => {
		const { engine, site } = setup();
		await engine.start();
		site.approver = GUEST;
		await engine.link();
		await waitFor(() => engine.view.linked);
		await engine.tick();
		expect(engine.view.notice).toMatch(/^Linked as Guest#2, but none of the recordings/);
		expect(engine.view.characters[0]).toMatchObject({ status: 'unlinked' });
		expect(engine.view.links).toMatchObject([{ id: GUEST.battlenetId, hasRecordings: false }]);
		expect(engine.view.setup).toBeNull();
		expect(site.plans).toEqual([]);
	});

	it('forgets an account whose folder is gone, and keeps its link', async () => {
		const { engine, site, host, guest } = await linked(shared());
		await engine.beginUploading();
		site.approver = GUEST;
		await engine.link();
		await waitFor(() => engine.view.links.length === 2);
		await engine.tick();
		host.files.delete(guest);
		await engine.tick();
		expect(engine.view.accounts.map((a) => a.id)).toEqual([OWNER.battlenetId]);
		expect(engine.view.characters.map((c) => c.key)).not.toContain(guest);
		expect(engine.view.links).toMatchObject([
			{ id: OWNER.battlenetId, hasRecordings: true },
			{ id: GUEST.battlenetId, hasRecordings: false }
		]);
	});

	it('sends a folder that doesn’t say whose it is under the one link, and under none of several', async () => {
		const { engine, site, host } = await linked();
		await engine.beginUploading();
		const old = host.save(
			'Averil',
			recording(AVERIL, 'Averil', [[T + 100, 2]]),
			'_retail_',
			'Widsith.lua',
			'OLDACCOUNT'
		);
		host.wait(MINUTE);
		await engine.tick();
		expect(engine.view.characters.find((c) => c.key === old)).toMatchObject({
			account: null,
			status: 'kept'
		});
		expect(engine.view.accounts.map((a) => a.id)).toEqual([null, OWNER.battlenetId]);
		site.approver = GUEST;
		await engine.link();
		await waitFor(() => engine.view.links.length === 2);
		await engine.tick();
		expect(engine.view.characters.find((c) => c.key === old)).toMatchObject({ status: 'unlinked' });
	});
});
