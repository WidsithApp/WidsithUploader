// Copies the files the uploader shares with the site: the reader for the game's saved files, and
// the flame the window shows in its header. The site's copies are the originals; this brings ours
// level with them (scripts/shared.mjs says how). A test fails when a pair differs, so a change to
// one is never forgotten in the other.
//
//   npm run shared

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ours, pathOf, SHARED, siteRoot, theirsOf } from './shared.mjs';

if (!siteRoot()) {
	console.error("Set WIDSITH_SITE to a checkout of the site's source; there is nothing to copy from otherwise.");
	process.exit(1);
}
for (const file of SHARED) {
	const from = theirsOf(file);
	const to = pathOf(file.ours);
	if (!existsSync(from)) {
		console.error(`The site has no ${file.theirs}, so ${file.ours.slice(3)} was left as it is.`);
		process.exitCode = 1;
		continue;
	}
	writeFileSync(to, ours(readFileSync(from, 'utf8'), file.comment));
	console.log(`${file.ours.slice(3)} is level with the site.`);
}
