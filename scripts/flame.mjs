// What the two icon scripts share: the flame, read from the window's own copy of the site's mark
// (src/ui/Logo.svelte), so the pictures can't drift from it, laid on a midnight disc; and `sharp`
// to render it, which is not one of this folder's dependencies. Install it somewhere and point
// SHARP at that package.json.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export function findSharp() {
	const places = [process.env.SHARP];
	const from = places.find((place) => place && existsSync(place));
	if (!from) {
		console.error('sharp was not found. Set SHARP to a package.json whose folder has it installed.');
		process.exit(1);
	}
	return createRequire(from)('sharp');
}

const logo = readFileSync(fileURLToPath(new URL('../src/ui/Logo.svelte', import.meta.url)), 'utf8');

function read(pattern, what) {
	const found = logo.match(pattern);
	if (!found) throw new Error(`Logo.svelte no longer has ${what} where this script looks for it.`);
	return found[1];
}

/** The flame's outline in a 64-unit box. */
const OUTLINE = read(/const OUTLINE =\s*'([^']+)'/, 'its outline');

/** A list of layers, outer to heart: `FOUR` for a large mark, `THREE` for a small one. */
function layers(name) {
	const list = read(new RegExp(`const ${name} = \\[([^\\]]+)\\]`), `its ${name} list`);
	return [...list.matchAll(/scale:\s*([\d.]+),\s*fill:\s*'(#[0-9a-fA-F]+)'/g)].map((m) => ({
		scale: Number(m[1]),
		fill: m[2]
	}));
}

/** The page behind the site at night, and its ink. */
const MIDNIGHT = '#121626';
const RIM = '#f2e8d0';

/**
 * The flame on a midnight disc that fills a 64-unit box, drawn at `pixels` square. The rim is two
 * units wide, one pixel at 32, so the disc holds its edge on a dark taskbar as well as a light one.
 * `fills`, when given, colours the layers in their place, outer to heart: the same flame in other
 * colours.
 */
export function flameOnDisc(name, pixels, fills) {
	// Every layer is the outline scaled about the base centre, as the mark draws it; the whole
	// flame is then shrunk a little about the box's centre to sit inside the rim.
	const fit = 0.86;
	const paths = layers(name)
		.map(
			(layer, index) =>
				`<path d="${OUTLINE}" fill="${fills?.[index] ?? layer.fill}" transform="translate(32 61) scale(${layer.scale}) translate(-32 -61)"/>`
		)
		.join('\n    ');
	return `
<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="31" fill="${MIDNIGHT}"/>
  <g transform="translate(32 32) scale(${fit}) translate(-32 -32)">
    ${paths}
  </g>
  <circle cx="32" cy="32" r="31" fill="none" stroke="${RIM}" stroke-opacity="0.3" stroke-width="2"/>
</svg>`;
}
