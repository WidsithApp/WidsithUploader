// The files the uploader shares with the site, and how each is brought level. The site's copies
// are the originals, read from the checkout of the site's source that WIDSITH_SITE names. The reader for the game's saved files is copied as it is. The flame is copied
// with its opening comment replaced by one of this folder's own, since the site's comment speaks
// of the site; the drawing and its motion are what must stay the same, and the test compares the
// files with their opening comments set aside.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED = [
	{
		theirs: 'src/lib/journey/lua.ts',
		ours: '../src/shared/lua.ts',
		comment: null
	},
	{
		theirs: 'src/lib/site/Logo.svelte',
		ours: '../src/ui/Logo.svelte',
		comment: [
			"The Widsith mark from the site's header: one outline drawn four times, scaled in from the",
			'base, dark to light (three times under 24 px, where the fourth turns to mush). From 32 px it',
			'stands on a small map, a dashed road winding in to its base between contour lines, fading out',
			'before any edge shows; `map={false}` draws the flame alone. Animation stops under reduced',
			'motion. Copied from the site by `npm run shared`; a test fails if they drift.'
		]
	}
];

export function pathOf(relative) {
	return fileURLToPath(new URL(relative, import.meta.url));
}

/** The checkout of the site's source that WIDSITH_SITE names, or null when it names none. */
export function siteRoot() {
	const site = process.env.WIDSITH_SITE;
	return site && existsSync(site) ? site : null;
}

/** A shared file's path in the site's checkout. */
export function theirsOf(file) {
	return join(siteRoot(), file.theirs);
}

/** The opening comment of a Svelte script block: the `//` lines right after `<script lang="ts">`. */
const OPENING = /^(<script lang="ts">\r?\n)((?:\t\/\/.*\r?\n)+)/;

/** A shared file's text as this folder keeps it: line endings level, the opening comment ours. */
export function ours(text, comment) {
	const level = text.replaceAll('\r\n', '\n');
	if (!comment) return level;
	return level.replace(OPENING, (_, open) => `${open}${comment.map((line) => `\t// ${line}`).join('\n')}\n`);
}
