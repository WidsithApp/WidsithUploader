// Draws the tray icon: the Widsith flame, the site's mark, on a midnight disc. At sixteen pixels
// the mark's fourth layer turns to mush, so the tray has the three-layer flame the site uses when
// the mark is small. A second picture shows the same flame drawn in greys, put out, for while the
// player has paused uploading.
//
//   npm run tray-icon
//
// Writes src-tauri/icons/tray.png and src-tauri/icons/tray-paused.png at 32×32 (Windows shows
// them at 16 to 32 pixels), rendered at eight times the size and shrunk, so their edges are
// smooth. Run once when the drawing changes; the pictures are kept in the repository. See
// flame.mjs for where `sharp` comes from.

import { fileURLToPath } from 'node:url';
import { findSharp, flameOnDisc } from './flame.mjs';

const sharp = findSharp();

const SIZE = 32;
const SUPER = 8;
/** The paused flame's layers, outer to heart: dark to light, as the lit one goes. */
const GREYS = ['#6f6c7a', '#9a97a6', '#c9c6d1'];

const pictures = [
	{ file: 'tray.png', svg: flameOnDisc('THREE', SIZE * SUPER) },
	{ file: 'tray-paused.png', svg: flameOnDisc('THREE', SIZE * SUPER, GREYS) }
];

const bigs = [];
for (const { file, svg } of pictures) {
	const out = fileURLToPath(new URL(`../src-tauri/icons/${file}`, import.meta.url));
	const big = await sharp(Buffer.from(svg)).png().toBuffer();
	await sharp(big).resize(SIZE, SIZE, { kernel: 'lanczos3' }).png().toFile(out);
	console.log(`wrote src-tauri/icons/${file}`);
	bigs.push(big);
}

if (process.argv[2]) {
	// A look at them as the tray shows them, and enlarged, on a dark taskbar and a light one, the
	// lit flame above the paused one: node scripts/build-tray-icon.mjs preview.png
	const tile = (buffer, at) => sharp(buffer).resize(at, at, { kernel: 'nearest' }).png().toBuffer();
	const layers = [
		{
			input: await sharp({ create: { width: 280, height: 320, channels: 4, background: '#e9e9ee' } })
				.png()
				.toBuffer(),
			left: 280,
			top: 0
		}
	];
	for (const [row, big] of bigs.entries()) {
		const small = await sharp(big).resize(16, 16, { kernel: 'lanczos3' }).png().toBuffer();
		const full = await sharp(big).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer();
		const top = row * 160;
		for (const left of [0, 280]) {
			layers.push(
				{ input: small, left: left + 20, top: top + 72 },
				{ input: full, left: left + 56, top: top + 64 },
				{ input: await tile(small, 128), left: left + 120, top: top + 16 }
			);
		}
	}
	await sharp({ create: { width: 560, height: 320, channels: 4, background: '#202330' } })
		.composite(layers)
		.png()
		.toFile(process.argv[2]);
	console.log('wrote', process.argv[2]);
}
