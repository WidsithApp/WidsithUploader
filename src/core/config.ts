// Names and timings, in one place.

/** The site, as it is named to players. */
export const SITE_NAME = 'Widsith';
/** This app. */
export const APP_NAME = 'Widsith Uploader';
/** Where recordings go unless a developer points the app elsewhere. */
export const DEFAULT_SERVER = 'https://widsith.app';

/**
 * The addon's saved file and the folder it is installed in. The game names the file after the
 * folder. Before version 0.3.0 the addon went by its earlier name, WoWJourney, and its files by
 * that name are still read and sent: the addon never writes to them again.
 */
export const RECORDING_FILE = 'Widsith.lua';
export const ADDON_FOLDER = 'Widsith';
export const EARLIER_RECORDING_FILE = 'WoWJourney.lua';

/** The saved table inside the file, under the addon's name and then its earlier name. */
export const RECORDING_TABLES = ['WidsithDB', 'WoWJourneyDB'] as const;

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const TIMING = {
	/** A file changed more recently than this may still be being written: left for the next look. */
	settle: 3 * SECOND,
	/** A file that can't be read is tried again while it is this fresh, then called unreadable. */
	unreadableAfter: MINUTE,
	/** How often the game's folders are looked for again. */
	installs: 5 * MINUTE,
	/**
	 * What the site said about the account (which characters it keeps, each one's level and
	 * sharing) is asked again after every send that went through, since the site read what was
	 * sent; when the player looks at the window and the answer is older than `accountFresh`, since
	 * a change made on the site should show when they come back to the window; and in any case
	 * once it is older than `account`.
	 */
	account: 30 * MINUTE,
	accountFresh: MINUTE,
	/** After the site can't be reached: wait this long, doubling each time, up to `retryMax`. */
	retry: 30 * SECOND,
	retryMax: 10 * MINUTE,
	/** A character the site turned away is offered again this often. */
	turnedAway: 60 * MINUTE,
	/** The first look for a newer version of the app, this long after it starts, then this often. */
	updateFirst: 30 * SECOND,
	updateEvery: 6 * 60 * MINUTE,
	/**
	 * A downloaded update goes in by itself once it has been ready this long and the window hasn't
	 * been looked at for as long.
	 */
	updateIdle: 10 * MINUTE
};

/**
 * How long each request to the site is waited for before it is given up, so that a connection
 * which stalls after the computer sleeps or changes network fails like any other and is tried
 * again, instead of holding up everything behind it. `quick` is for every request the site
 * answers from what it has. `send` is for a session, and for the site's reading of what was sent
 * (`done`, which rebuilds the character before it answers), and equals the longest the site lets a
 * request run, so the app never gives up on either before the site would.
 */
export const PATIENCE = {
	quick: 30 * SECOND,
	send: 5 * MINUTE
};
