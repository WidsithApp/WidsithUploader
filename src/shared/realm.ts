// A realm as a player reads it. WoW Forever has no realms a player picks: what the game reports
// as the realm is Blizzard's internal name for the shard, with the type as its last word
// ("CAMWOW US1 Realm 3 PvE"). The player chose PvE and nothing else, so to them the type is the
// realm, and that is the word the site and this window show; the recorded name stays what the
// app matches files by, since the game names the file's folder with it. Any other realm is its
// own name. Copied from the site by `npm run shared`; a test fails if they drift.

/** The realm types a name can end in, by the last word lower-cased, as the site writes each. */
const TYPES = new Map<string, string>([
	['pve', 'PvE'],
	['pvp', 'PvP'],
	['rp', 'RP'],
	['rp-pvp', 'RP-PvP'],
	['rppvp', 'RP-PvP'],
	['hardcore', 'Hardcore']
]);

/** The realm's type when its name names one ("CAMWOW US1 Realm 3 PvE" is a PvE realm); else null. */
export function realmType(realm: string | null | undefined): string | null {
	if (!realm) return null;
	const words = realm.trim().split(/\s+/);
	if (words.length < 2) return null;
	return TYPES.get(words[words.length - 1].toLowerCase()) ?? null;
}

/**
 * The realm as a reader sees it beside a character: its type where the name is Blizzard's internal
 * one ("PvE"), else the name itself ("Steamwheedle Cartel"); null for none.
 */
export function realmLabel(realm: string | null | undefined): string | null {
	if (!realm) return null;
	return realmType(realm) ?? realm;
}

/**
 * The realm in a sentence that says where a character is: "on Steamwheedle Cartel", or "on a PvE
 * realm" where the name is only a type to its player. Empty for none, so a sentence can leave it out.
 */
export function onRealm(realm: string | null | undefined): string {
	if (!realm) return '';
	const type = realmType(realm);
	return type ? `on a ${type} realm` : `on ${realm}`;
}
