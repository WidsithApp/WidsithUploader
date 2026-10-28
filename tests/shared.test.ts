import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ours, pathOf, SHARED, siteRoot, theirsOf } from '../scripts/shared.mjs';

// The window's flame and the reader for the game's saved files are the site's own, copied. When
// WIDSITH_SITE names a checkout of the site's source, check that neither copy has drifted from it.
// If one has, run: npm run shared
describe.skipIf(!siteRoot())('the uploader and the site', () => {
	for (const file of SHARED) {
		it(`share ${file.ours.slice(3)}, line for line`, () => {
			const theirs = readFileSync(theirsOf(file), 'utf8');
			const mine = readFileSync(pathOf(file.ours), 'utf8');
			expect(ours(mine, null)).toBe(ours(theirs, file.comment));
		});
	}
});
