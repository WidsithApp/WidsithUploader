// A recording file split into its sessions, each written out one fixed way.
//
// The game rewrites the whole SavedVariables file on every save, and may write a table's fields
// in a different order each time; the addon also cuts a session's lines into chunks. None of that
// is the session. So a session is sent in a fixed form: a first line naming the form, then every
// field of its container but the chunks, sorted by name, then a blank line, then its lines. Two
// saves of the same session give the same text, so the same SHA-256, and the site can tell what
// it already has without being sent it.
//
// The player's own /say and /yell are never sent. Older versions of the addon wrote them as
// SPEECH lines; they are dropped from each session before it is written out, and how many went
// is kept beside the addon's own line count, so the session still adds up.
//
// The site reads recordings with the same rules. A test checks the two agree, session for
// session, on every recording it can find.

import {
	asIndexedList,
	asList,
	asTable,
	parseSavedVariables,
	type LuaTable,
	type LuaValue
} from '../shared/lua.ts';
import { RECORDING_TABLES } from './config.ts';

/** The first line of every session in its fixed form. */
export const STORED_FORM = 'WJS 1';

export interface SplitSession {
	/** When the session began: its SESSION line's server time, else its container's `startedAt`. */
	serverTime: number | null;
	/** Whether the addon closed it. An open session may still grow. */
	closed: boolean;
	lineCount: number;
	/** The session in its fixed form. */
	text: string;
	/**
	 * The character that played it, as its SESSION line names it; null when the line doesn't say,
	 * and such a session belongs to the character the recording's table names.
	 */
	playerGUID: string | null;
}

/** Which game a recording was made in. */
export type Game = 'forever' | 'retail' | 'classic';

/**
 * Sessions in a file played by a character other than the one its table names. The game keeps one
 * file per name and realm, so when a character is deleted and another is made with the same name,
 * the new one's file still holds the sessions the deleted one played.
 */
export interface EarlierCharacter {
	guid: string;
	sessions: SplitSession[];
	/** The game, from its first session's SESSION line. */
	game: Game | null;
}

export interface SplitFile {
	/** WoWJourneyDB.format. */
	format: number | null;
	/** The recording's character table, as written. */
	character: LuaTable;
	guid: string | null;
	/**
	 * The name as shown: on WoW Forever, where every character has a surname as well and only the
	 * two together are unique, the full name ("Aldwin Thornby"); elsewhere the name alone.
	 */
	name: string | null;
	realm: string | null;
	classID: number | null;
	raceID: number | null;
	region: number | null;
	/** Read from the first session's SESSION line; null when that line doesn't say. */
	game: Game | null;
	/** Every session in the file, in its order, whoever played it. */
	sessions: SplitSession[];
	/**
	 * The sessions among them played by earlier characters of the same name, one entry for each,
	 * in the order they first appear. Never sent as the character the table names.
	 */
	earlier: EarlierCharacter[];
}

/** The file isn't a Widsith recording, or was read while the game was still writing it. */
export class NotARecording extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotARecording';
	}
}

/** A value as JSON with every table's keys sorted, so the same value is always the same text. */
function fixed(value: LuaValue): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(fixed).join(',')}]`;
	const keys = Object.keys(value).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${fixed(value[key])}`).join(',')}}`;
}

function isRaw(container: LuaTable): boolean {
	const encoding = container.encoding;
	return encoding === undefined || encoding === 'raw';
}

/** A session's lines: its chunks joined, then split. */
function linesOf(container: LuaTable): string[] {
	const chunks = asList(container.chunks).filter((c): c is string => typeof c === 'string');
	const lines = chunks.join('\n').split('\n');
	return lines.length === 1 && lines[0] === '' ? [] : lines;
}

/**
 * A session container without the player's own /say and /yell: its SPEECH lines dropped, and how
 * many went kept as `speechDropped` (added to any count already there), so the lines left are the
 * addon's `lines` less `speechDropped`. A container with none comes back as it was, the same
 * object, so its fixed form doesn't change. The first line (SESSION) is never touched, and the
 * rest keep their order, so an open session that grows still begins with what was sent before.
 * An encoding this can't read is left as it is.
 */
export function withoutSpeech(container: LuaTable): LuaTable {
	const encoding = container.encoding;
	if (encoding !== undefined && encoding !== 'raw') return container;
	const chunks = asList(container.chunks).filter((c): c is string => typeof c === 'string');
	const lines = chunks.join('\n').split('\n');
	const kept = lines.filter((line) => line.split('\t')[1] !== 'SPEECH');
	const dropped = lines.length - kept.length;
	if (dropped === 0) return container;
	const before = typeof container.speechDropped === 'number' ? container.speechDropped : 0;
	return {
		...container,
		chunks: kept.length > 0 ? [kept.join('\n')] : [],
		speechDropped: before + dropped
	};
}

/** A session container in its fixed form. */
export function sessionText(container: LuaTable): string {
	const raw = isRaw(container);
	const fields = Object.keys(container)
		.filter((key) => !(raw && key === 'chunks'))
		.sort()
		.map((key) => `${JSON.stringify(key)}=${fixed(container[key])}`);
	const lines = raw ? linesOf(container) : [];
	return `${[STORED_FORM, ...fields].join('\n')}\n\n${lines.join('\n')}`;
}

function serverTimeOf(container: LuaTable, lines: string[]): number | null {
	const first = lines[0]?.split('\t') ?? [];
	const fromLine = first[1] === 'SESSION' ? Number(first[2]) : NaN;
	if (Number.isFinite(fromLine)) return fromLine;
	return typeof container.startedAt === 'number' ? container.startedAt : null;
}

const text = (value: LuaValue | undefined): string | null =>
	typeof value === 'string' ? value : null;

const number = (value: LuaValue | undefined): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

/** "Aldwin Thornby", or the name alone when there is no surname; null without a name. */
const fullName = (name: string | null, surname: string | null): string | null =>
	name ? (surname ? `${name} ${surname}` : name) : null;

/** The game's own project IDs for Classic Era and the progression Classics. */
const CLASSIC_PROJECTS = new Set([2, 5, 11, 14, 19]);

/** A client whose version's major number is below this is WoW Forever (1.x); Retail is 12.x. */
const RETAIL_FIRST_MAJOR = 10;

/**
 * The game a SESSION line was written in, by the rule the site uses: a Classic project ID is
 * Classic; otherwise the client's version tells WoW Forever from Retail, since both run on the
 * same client. A line with a project but no version is Retail; one with neither says nothing.
 */
export function gameOfSessionLine(line: string | undefined): Game | null {
	const fields = line?.split('\t') ?? [];
	if (fields[1] !== 'SESSION') return null;
	const version = fields[5] ?? '';
	const project = fields[7] !== undefined && fields[7] !== '' ? Number(fields[7]) : NaN;
	if (CLASSIC_PROJECTS.has(project)) return 'classic';
	const major = Number.parseInt(version, 10);
	if (Number.isFinite(major)) return major < RETAIL_FIRST_MAJOR ? 'forever' : 'retail';
	return Number.isFinite(project) ? 'retail' : null;
}

/** Splits a recording file's text. Throws `NotARecording` if it isn't one. */
export function splitRecording(source: string): SplitFile {
	let root: LuaValue | undefined;
	try {
		const saved = parseSavedVariables(source);
		root = RECORDING_TABLES.map((name) => saved[name]).find((table) => table !== undefined);
	} catch (error) {
		throw new NotARecording(`The file couldn't be read: ${(error as Error).message}`);
	}
	if (root === undefined) throw new NotARecording('The file holds no recording.');
	const db = asTable(root);
	const character = asTable(db.character);
	const guid = text(character.guid);
	const firstLines: (string | undefined)[] = [];
	const sessions = asIndexedList(db.sessions)
		.filter((entry) => entry !== null && typeof entry === 'object')
		.map((entry): SplitSession => {
			const container = withoutSpeech(asTable(entry));
			const lines = isRaw(container) ? linesOf(container) : [];
			firstLines.push(lines[0]);
			return {
				serverTime: serverTimeOf(container, lines),
				closed: container.closed === true,
				lineCount: lines.length,
				text: sessionText(container),
				playerGUID: playerOfSessionLine(lines[0])
			};
		});
	const earlier = new Map<string, EarlierCharacter>();
	sessions.forEach((session, index) => {
		const player = session.playerGUID;
		if (player === null || player === guid) return;
		let group = earlier.get(player);
		if (!group) {
			group = { guid: player, sessions: [], game: gameOfSessionLine(firstLines[index]) };
			earlier.set(player, group);
		}
		group.sessions.push(session);
	});
	return {
		format: typeof db.format === 'number' ? db.format : null,
		character,
		guid,
		name: fullName(text(character.name), text(character.surname)),
		realm: text(character.realm),
		classID: number(character.classID),
		raceID: number(character.raceID),
		region: number(character.region),
		game: gameOfSessionLine(firstLines[0]),
		sessions,
		earlier: [...earlier.values()]
	};
}

/**
 * The character a SESSION line says played the session, field 11 of the line; null when the line
 * isn't one or doesn't say.
 */
export function playerOfSessionLine(line: string | undefined): string | null {
	const fields = line?.split('\t') ?? [];
	if (fields[1] !== 'SESSION') return null;
	const guid = fields[11]?.trim() ?? '';
	return guid === '' ? null : guid;
}

/** The sessions in a file that are its table's character's own, not an earlier character's. */
export function ownSessions(file: SplitFile): SplitSession[] {
	return file.sessions.filter((s) => s.playerGUID === null || s.playerGUID === file.guid);
}

/**
 * A file as one earlier character in it: that character's sessions alone, and the file's
 * character table with its GUID in place of the table's own. What else the table says (the
 * class, the race) is the newer character's: the file keeps no table of the earlier one's.
 */
export function asEarlier(file: SplitFile, guid: string): SplitFile | null {
	const group = file.earlier.find((e) => e.guid === guid);
	if (!group) return null;
	return {
		...file,
		character: { ...file.character, guid },
		guid,
		game: group.game,
		sessions: group.sessions,
		earlier: []
	};
}
