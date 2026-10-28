import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { siteRoot } from '../scripts/shared.mjs';
import {
	asEarlier,
	NotARecording,
	ownSessions,
	splitRecording,
	STORED_FORM,
	withoutSpeech
} from '../src/core/sessions.ts';
import { flavorName, isOlder } from '../src/core/version.ts';
import { recording, SEVRA, type Client } from './fakes.ts';

const T = 1789990000;

describe('splitting a recording', () => {
	it('gives the character and each session in its fixed form', () => {
		const file = splitRecording(recording(SEVRA, 'Sevra', [[T, 2], [T + 900, 0, false]]));
		expect(file).toMatchObject({
			format: 1,
			guid: SEVRA,
			name: 'Sevra',
			realm: 'Steamwheedle Cartel'
		});
		expect(file.character).toMatchObject({ region: 1, classID: 6 });
		expect(file.sessions).toHaveLength(2);
		expect(file.sessions[0]).toMatchObject({ serverTime: T, closed: true, lineCount: 3 });
		expect(file.sessions[1]).toMatchObject({ serverTime: T + 900, closed: false, lineCount: 1 });
		const [form, ...rest] = file.sessions[0].text.split('\n');
		expect(form).toBe(STORED_FORM);
		// Fields sorted by name, the chunks left out, a blank line, then the lines. The addon wrote
		// four, one of them a /say: three are sent, and the one left out is counted.
		expect(rest.slice(0, 7)).toEqual([
			'"closed"=true',
			'"encoding"="raw"',
			`"id"="${T}-1"`,
			'"lines"=4',
			'"speechDropped"=1',
			`"startedAt"=${T}`,
			''
		]);
		expect(rest[7]).toMatch(/^0\tSESSION\t/);
		expect(rest.slice(7)).toHaveLength(3);
		expect(file.sessions[0].text).not.toContain('\tSPEECH\t');
	});

	it('never sends the player’s own /say or /yell, and leaves a session without any as it was', () => {
		const container = {
			id: 'a',
			closed: false,
			encoding: 'raw',
			lines: 4,
			chunks: [
				`0\tSESSION\t${T}\t0.2.24\n1000\tSPEECH\tsay\t7\thi`,
				'2000\tPOS\t37\n3000\tSPEECH\tyell\t7\tho'
			]
		};
		const out = withoutSpeech(container);
		expect(out).toMatchObject({
			lines: 4,
			speechDropped: 2,
			chunks: [`0\tSESSION\t${T}\t0.2.24\n2000\tPOS\t37`]
		});
		expect(container.chunks).toHaveLength(2);
		expect(withoutSpeech(out)).toBe(out);
		expect(withoutSpeech({ ...container, speechDropped: 1 }).speechDropped).toBe(3);
		const unread = { ...container, encoding: 'packed' };
		expect(withoutSpeech(unread)).toBe(unread);
	});

	it('keeps an open session that grows beginning with what was sent before', () => {
		const lines = (text: string) => text.slice(text.indexOf('\n\n') + 2).split('\n');
		const before = splitRecording(recording(SEVRA, 'Sevra', [[T, 2, false]])).sessions[0];
		const after = splitRecording(recording(SEVRA, 'Sevra', [[T, 5, false]])).sessions[0];
		expect(before.serverTime).toBe(after.serverTime);
		expect(lines(after.text).slice(0, before.lineCount)).toEqual(lines(before.text));
	});

	it('gives the same text however the game ordered the fields or cut the chunks', () => {
		const lines = [`0\tSESSION\t${T}\t0.2.24`, '1000\tPOS\t37', '2000\tPOS\t37'];
		const one = `WoWJourneyDB = { ["character"] = { ["guid"] = "${SEVRA}" }, ["sessions"] = { {
			["id"] = "a", ["closed"] = true, ["chunks"] = { "${lines.join('\\n')}" }, ["encoding"] = "raw" } } }`;
		const other = `WoWJourneyDB = { ["sessions"] = { {
			["encoding"] = "raw", ["chunks"] = { "${lines[0]}", "${lines.slice(1).join('\\n')}" },
			["closed"] = true, ["id"] = "a" } }, ["character"] = { ["guid"] = "${SEVRA}" } }`;
		expect(splitRecording(one).sessions[0].text).toBe(splitRecording(other).sessions[0].text);
	});

	it('reads a file the addon wrote under its earlier name the same way', () => {
		const now = splitRecording(recording(SEVRA, 'Sevra', [[T, 2]]));
		const before = splitRecording(recording(SEVRA, 'Sevra', [[T, 2]], 1, true));
		expect(before).toEqual(now);
	});

	it('names a Forever character in full once the addon records its surname', () => {
		const plain = recording(SEVRA, 'Sevra', [[T, 2]]);
		expect(splitRecording(plain).name).toBe('Sevra');
		const withSurname = plain.replace('["name"] = "Sevra",', '["name"] = "Sevra",\n\t\t["surname"] = "Ashvale",');
		const file = splitRecording(withSurname);
		expect(file.name).toBe('Sevra Ashvale');
		// The character table goes to the site as written, the surname with it.
		expect(file.character).toMatchObject({ name: 'Sevra', surname: 'Ashvale' });
	});

	it('tells an earlier character of the same name apart, by the GUID each session names', () => {
		// Sevra deleted and made again: the file's table names the new one, and still holds the
		// sessions the old one played, which name the old one's GUID.
		const OLD = 'Player-1071-00000OLD';
		const file = splitRecording(
			recording(SEVRA, 'Sevra', [
				[T, 2, true, OLD],
				[T + 900, 1, true, OLD],
				[T + 5000, 3],
				[T + 6000, 0, true, '']
			])
		);
		expect(file.guid).toBe(SEVRA);
		expect(file.sessions.map((s) => s.playerGUID)).toEqual([OLD, OLD, SEVRA, null]);
		// A session whose line names nobody is the table's character's own.
		expect(ownSessions(file).map((s) => s.serverTime)).toEqual([T + 5000, T + 6000]);
		expect(file.earlier).toHaveLength(1);
		expect(file.earlier[0]).toMatchObject({ guid: OLD, game: 'retail' });
		expect(file.earlier[0].sessions.map((s) => s.serverTime)).toEqual([T, T + 900]);

		// Sent as itself: its sessions alone, and the table under its own GUID.
		const old = asEarlier(file, OLD);
		expect(old).toMatchObject({ guid: OLD, name: 'Sevra', earlier: [] });
		expect(old?.character).toMatchObject({ guid: OLD, name: 'Sevra' });
		expect(old?.sessions.map((s) => s.serverTime)).toEqual([T, T + 900]);
		expect(file.character.guid).toBe(SEVRA);
		expect(asEarlier(file, 'Player-1-NOBODY')).toBeNull();

		// A file of one character has none.
		expect(splitRecording(recording(SEVRA, 'Sevra', [[T, 2]])).earlier).toEqual([]);
	});

	it('refuses a file that isn’t one, or is cut short', () => {
		expect(() => splitRecording('SomethingElse = {}')).toThrow(NotARecording);
		expect(() => splitRecording('WidsithDB = { ["sessions"] = {')).toThrow(NotARecording);
		expect(() => splitRecording('')).toThrow(NotARecording);
	});
});

describe('which game a recording was made in', () => {
	const gameOf = (client: Client) =>
		splitRecording(recording(SEVRA, 'Sevra', [[T, 1], [T + 900, 0]], 1, false, client));

	it('is read from the first session’s SESSION line', () => {
		expect(gameOf({ clientVersion: '1.60.0', projectID: 18 }).game).toBe('forever');
		// The Forever beta's first builds said they were Mainline: the version tells them apart.
		expect(gameOf({ clientVersion: '1.60.0', projectID: 1 }).game).toBe('forever');
		expect(gameOf({ clientVersion: '12.1.0', projectID: 1 }).game).toBe('retail');
		expect(gameOf({ clientVersion: '1.15.7', projectID: 2 }).game).toBe('classic');
		expect(gameOf({ clientVersion: '5.5.0', projectID: 19 }).game).toBe('classic');
		// A project but no version is Retail; neither says nothing.
		expect(gameOf({ clientVersion: '', projectID: 1 }).game).toBe('retail');
		expect(gameOf({ clientVersion: '', projectID: null }).game).toBeNull();
	});

	it('is null for a recording with no sessions, and the character’s numbers are read too', () => {
		const empty = splitRecording(recording(SEVRA, 'Sevra', [], 90));
		expect(empty).toMatchObject({ game: null, classID: 6, raceID: 10, region: 90 });
	});

	it('leaves each session’s fixed form as it was', () => {
		const forever = gameOf({ clientVersion: '1.60.0', projectID: 18 });
		for (const session of forever.sessions) {
			expect(Object.keys(session).sort()).toEqual([
				'closed',
				'lineCount',
				'playerGUID',
				'serverTime',
				'text'
			]);
			expect(session.text).not.toMatch(/forever/i);
		}
	});
});

describe('versions and folder names', () => {
	it('compares versions by their numbers', () => {
		expect(isOlder('0.2.9', '0.2.14')).toBe(true);
		expect(isOlder('0.2.14', '0.2.9')).toBe(false);
		expect(isOlder('0.2.14', '0.2.14')).toBe(false);
		expect(isOlder('0.2', '0.2.1')).toBe(true);
		expect(isOlder('1.0', '0.9.9')).toBe(false);
	});

	it('names a game folder as a player would', () => {
		expect(flavorName('_retail_')).toBe('Retail');
		expect(flavorName('_classic_era_')).toBe('Classic Era');
	});
});

// The site reads recordings with the same rules. When WIDSITH_SITE names a checkout of the site's
// source, check the two agree on every recording there is: the made-up one here, and any .lua file
// in the folder WIDSITH_RECORDINGS names.
const siteDir = siteRoot();
const site = siteDir ? join(siteDir, 'src/lib/journey/stored.ts') : null;
const samples = process.env.WIDSITH_RECORDINGS ? process.env.WIDSITH_RECORDINGS.replace(/[\\/]?$/, '/') : null;

describe.skipIf(!site || !existsSync(site))('the uploader and the site read a recording alike', async () => {
	const { storedFile } = site && existsSync(site)
		? ((await import(/* @vite-ignore */ pathToFileURL(site).href)) as {
				storedFile: (source: string) => {
					format: unknown;
					character: unknown;
					sessions: { serverTime: number | null; closed: boolean; lineCount: number; text: string }[];
				};
			})
		: { storedFile: null as never };
	const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

	const sources: [string, string][] = [
		['a made-up recording', recording(SEVRA, 'Sevra', [[T, 40], [T + 900, 0, false]])]
	];
	if (samples && existsSync(samples)) {
		for (const name of readdirSync(samples)) {
			if (!name.endsWith('.lua')) continue;
			sources.push([name, readFileSync(samples + name, 'utf8')]);
		}
	}

	it('share one reader for the game’s saved files, line for line', () => {
		const level = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
		const ours = fileURLToPath(new URL('../src/shared/lua.ts', import.meta.url));
		const theirs = join(siteDir!, 'src/lib/journey/lua.ts');
		// If this fails, run: npm run shared
		expect(level(ours)).toBe(level(theirs));
	});

	it.each(sources)('%s', (_, source) => {
		const ours = splitRecording(source);
		const theirs = storedFile(source);
		expect(ours.format).toEqual(theirs.format);
		expect(ours.character).toEqual(theirs.character);
		expect(ours.sessions.length).toBe(theirs.sessions.length);
		expect(
			ours.sessions.map((s) => [s.serverTime, s.closed, s.lineCount, sha(s.text)])
		).toEqual(theirs.sessions.map((s) => [s.serverTime, s.closed, s.lineCount, sha(s.text)]));
	});
});
