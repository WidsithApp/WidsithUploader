// The pictures the addon takes at a character's highlights, found among the files the game wrote.
//
// With "Screenshot highlights" on, the addon takes a picture itself at a few moments (a level, a
// boss, a new zone…) and writes a SHOT line saying why. The game saves every picture, the
// player's own too, in the game folder's Screenshots folder, named by this computer's clock to the
// second: WoWScrnShot_MMDDYY_HHMMSS.jpg. A SHOT line with a reason and a file named within a few
// seconds of it are the same picture: the game names the file as the picture is taken, the addon's
// line follows within about a second, and this computer's clock, which names the file, may stand
// a few seconds from the game server's, which times the line. A SHOT line without a reason is a
// picture the player took with their own key, and is never counted.
//
// Only what is still there is counted, so a picture the player deleted isn't. The files are known
// by their names alone; no picture is ever opened.

import type { SplitSession } from './sessions.ts';

/** How far from its SHOT line's second, either way, the game may have named the picture, in ms. */
const SLACK = 5000;

/**
 * When each picture the addon took in these sessions was taken, ms since the epoch, in order: the
 * session's server time plus the SHOT line's time into the session.
 */
export function shotTimes(sessions: SplitSession[]): number[] {
	const times: number[] = [];
	for (const session of sessions) {
		if (session.serverTime === null) continue;
		// The session's fixed form: its fields, a blank line, then its lines.
		const blank = session.text.indexOf('\n\n');
		if (blank < 0) continue;
		for (const line of session.text.slice(blank + 2).split('\n')) {
			const fields = line.split('\t');
			if (fields[1] !== 'SHOT' || !fields[2]?.trim()) continue;
			const ms = Number(fields[0]);
			if (Number.isFinite(ms)) times.push(session.serverTime * 1000 + ms);
		}
	}
	return times.sort((a, b) => a - b);
}

/**
 * When the game says a picture was taken, by its file's name, ms since the epoch read on this
 * computer's clock; null for a file the game didn't name. Any extension: the game may save the
 * same second as `.jpg` and `.tga`.
 */
export function pictureTime(name: string): number | null {
	const match = /^WoWScrnShot_(\d\d)(\d\d)(\d\d)_(\d\d)(\d\d)(\d\d)\.[a-z0-9]+$/i.exec(name);
	if (!match) return null;
	const [month, day, year, hour, minute, second] = match.slice(1).map(Number);
	const at = new Date(2000 + year, month - 1, day, hour, minute, second);
	// A date no calendar has (a thirteenth month, a 31st of April) isn't one the game wrote.
	if (at.getMonth() !== month - 1 || at.getDate() !== day) return null;
	return at.getTime();
}

/**
 * How many of the pictures taken at `shots` (ms since the epoch) are among the files `names`. A
 * file is counted once at most, however many pictures it could be, and two files of the same
 * second are one picture.
 */
export function countPictures(shots: number[], names: string[]): number {
	const files = [
		...new Set(names.map(pictureTime).filter((time): time is number => time !== null))
	].sort((a, b) => a - b);
	let count = 0;
	let next = 0;
	// Earliest first on both sides: each picture takes the earliest file it could be, and a file
	// too early for one picture is too early for every later one.
	for (const shot of [...shots].sort((a, b) => a - b)) {
		const second = Math.floor(shot / 1000) * 1000;
		while (next < files.length && files[next] < second - SLACK) next++;
		if (next < files.length && files[next] <= second + SLACK) {
			count++;
			next++;
		}
	}
	return count;
}
