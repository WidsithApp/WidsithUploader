// Sending one character's recording: ask the site which sessions it lacks (by each one's time and
// SHA-256), send those gzipped, then tell it that's all. Bringing the same file again sends
// nothing. The steps are the ones the site's own pages take when a file is dropped on them.

import { Unlinked, type Api, type Sharing } from './api.ts';
import { ownSessions, type SplitFile } from './sessions.ts';

export interface SyncTools {
	gzip(text: string): Promise<Uint8Array<ArrayBuffer>>;
	sha256(text: string): Promise<string>;
}

export interface SyncOptions {
	/** How the character is kept, the first time it is sent. */
	sharing?: Sharing;
	/**
	 * The player chose just now to bring it back after removing it on the site, so the sessions
	 * they deleted come back with it, and the site doesn't answer that it was removed.
	 */
	fresh?: boolean;
	/** The last attempt sent sessions but never finished: finish even if nothing is left to send. */
	owesDone?: boolean;
	onProgress?: (sent: number, total: number) => void;
}

export type SyncProblem =
	| 'unlinked'
	| 'undecided'
	| 'kept-elsewhere'
	| 'no-region'
	| 'no-character'
	| 'unfinished'
	| 'failed';

export type SyncOutcome =
	| { ok: true; sent: number; refused: number; sharing: Sharing }
	/** Its player removed it on the site, when said (ms): nothing was sent. */
	| { ok: false; reason: 'removed'; removedAt: number | null; message: string; sent: number }
	| { ok: false; reason: SyncProblem; message: string; sent: number };

/** How many sessions are sent at once. */
const LANES = 4;

/**
 * Why the site turned a character away, in the words its own pages use: the reasons waiting won't
 * mend. Any other reason, such as one an older site gave, is taken as the site failing just now,
 * and tried again later without a word to the player.
 */
const TURNED_AWAY: Record<string, string> = {
	'kept-elsewhere': 'Another account already keeps this character.',
	'no-region': 'This recording doesn’t say which region its realm is in.',
	'not-a-character': 'This recording names no character.'
};

export async function syncRecording(
	api: Api,
	file: SplitFile,
	tools: SyncTools,
	options: SyncOptions = {}
): Promise<SyncOutcome> {
	const guid = file.guid;
	if (!guid) {
		return {
			ok: false,
			reason: 'no-character',
			message: 'This recording names no character.',
			sent: 0
		};
	}
	let sent = 0;
	try {
		// Only the character's own: sessions an earlier character of the same name played, still in
		// its file, are that character's, sent under its GUID or not at all.
		const timed = ownSessions(file).filter(
			(s): s is typeof s & { serverTime: number } => s.serverTime !== null
		);
		const digests = await Promise.all(timed.map((s) => tools.sha256(s.text)));
		const plan = await api.plan({
			guid,
			info: file.character,
			format: file.format,
			sharing: options.sharing,
			fresh: options.fresh ?? false,
			sessions: timed.map((s, i) => ({ serverTime: s.serverTime, digest: digests[i] }))
		});
		if (!plan.ok) {
			if (plan.reason === 'removed') {
				return {
					ok: false,
					reason: 'removed',
					removedAt: plan.removedAt,
					message: 'Removed from the site by its player.',
					sent
				};
			}
			if (plan.reason === 'undecided') {
				return {
					ok: false,
					reason: 'undecided',
					message: 'Choose how this character is kept first.',
					sent
				};
			}
			if (Object.hasOwn(TURNED_AWAY, plan.reason)) {
				return {
					ok: false,
					reason: (plan.reason === 'not-a-character' ? 'no-character' : plan.reason) as SyncProblem,
					message: TURNED_AWAY[plan.reason],
					sent
				};
			}
			return {
				ok: false,
				reason: 'failed',
				message: 'The site couldn’t take it just now. It will be tried again.',
				sent
			};
		}

		const wanted = new Set(plan.send);
		const sending = timed.filter((s) => wanted.has(s.serverTime));
		let refused = 0;
		let failure: string | null = null;
		let next = 0;
		options.onProgress?.(0, sending.length);
		// A few at a time: each is a round trip, and sessions don't depend on one another.
		const lane = async () => {
			while (failure === null && next < sending.length) {
				const session = sending[next++];
				const answer = await api.putSession(
					guid,
					session.serverTime,
					await tools.gzip(session.text)
				);
				if (!answer.ok) {
					failure = answer.message;
					return;
				}
				if (answer.result === 'refused') refused++;
				sent++;
				options.onProgress?.(sent, sending.length);
			}
		};
		await Promise.all(Array.from({ length: Math.min(LANES, sending.length) }, lane));
		if (failure !== null) return { ok: false, reason: 'failed', message: failure, sent };

		if (sent > 0 || options.owesDone || options.sharing !== undefined) {
			if (!(await api.done(guid))) {
				return {
					ok: false,
					reason: 'unfinished',
					message: 'It was sent, but the site didn’t finish reading it.',
					sent
				};
			}
		}
		return { ok: true, sent, refused, sharing: plan.sharing };
	} catch (cause) {
		if (cause instanceof Unlinked) {
			return { ok: false, reason: 'unlinked', message: cause.message, sent };
		}
		return {
			ok: false,
			reason: sent > 0 ? 'unfinished' : 'failed',
			message: 'The site couldn’t be reached. It will be tried again.',
			sent
		};
	}
}
