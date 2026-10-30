// What the two icon scripts share: the flame, read from the window's own copy of the site's mark
// (src/ui/Logo.svelte), so the pictures can't drift from it, drawn alone as the site's favicon
// draws it; and `sharp` to render it, which is not one of this folder's dependencies. Install it
// somewhere and point SHARP at that package.json.

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

/**
 * The flame alone, as the site's favicon draws it, on nothing, drawn at `pixels` square. The
 * outline runs from 3 to 61 in its 64-unit box, centred both ways; `margin` is the room left
 * around the box's middle 58 units, in the same units, so 0 fills the square from base to tip.
 * `fills`, when given, colours the layers in their place, outer to heart: the same flame in other
 * colours.
 */
export function flameAlone(name, pixels, { margin = 3, fills } = {}) {
	// Every layer is the outline scaled about the base centre, as the mark draws it.
	const paths = layers(name)
		.map(
			(layer, index) =>
				`<path d="${OUTLINE}" fill="${fills?.[index] ?? layer.fill}" transform="translate(32 61) scale(${layer.scale}) translate(-32 -61)"/>`
		)
		.join('\n  ');
	const side = 58 + 2 * margin;
	const corner = 32 - side / 2;
	return `
<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="${corner} ${corner} ${side} ${side}">
  ${paths}
</svg>`;
}
