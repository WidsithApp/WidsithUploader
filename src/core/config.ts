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
	/** How long what the site said about the account is trusted. */
	account: 30 * MINUTE,
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
