// Draws the tray icon: the Widsith flame alone, as the site draws its mark when it is small. At
// sixteen pixels the mark's fourth layer turns to mush, so the tray has the three-layer flame. A
// second picture shows the same flame drawn in greys, put out, for while the player has paused
// uploading.
//
//   npm run tray-icon
//
// Writes src-tauri/icons/tray.png and src-tauri/icons/tray-paused.png at 32×32 (Windows shows
// them at 16 to 32 pixels), rendered at eight times the size and shrunk, so their edges are
// smooth. Run once when the drawing changes; the pictures are kept in the repository. See
// flame.mjs for where `sharp` comes from.

import { fileURLToPath } from 'node:url';
import { findSharp, flameAlone } from './flame.mjs';

const sharp = findSharp();

const SIZE = 32;
const SUPER = 8;
/** The paused flame's layers, outer to heart: dark to light, as the lit one goes. */
const GREYS = ['#6f6c7a', '#9a97a6', '#c9c6d1'];

const pictures = [
	// Tray icons are small and sit close together, so the flame fills its square, tip to base.
	{ file: 'tray.png', svg: flameAlone('THREE', SIZE * SUPER, { margin: 0.5 }) },
	{ file: 'tray-paused.png', svg: flameAlone('THREE', SIZE * SUPER, { margin: 0.5, fills: GREYS }) }
];

const bigs = [];
for (const { file, svg } of pictures) {
	const out = fileURLToPath(new URL(`../src-tauri/icons/${file}`, import.meta.url));
	const big = await sharp(Buffer.from(svg)).png().toBuffer();
	await sharp(big).resize(SIZE, SIZE, { kernel: 'lanczos3' }).png().toFile(out);
	console.log(`wrote src-tauri/icons/${file}`);
	bigs.push(big);
}

// The tray menu's pictures, beside its words: the flame for Open, and Pause or Resume as the
// window's own icons draw them (Phosphor, MIT, fill weight), in the flame's amber, which holds on
// a light menu and a dark one. Windows draws a menu's picture in a 16-pixel square whatever the
// screen's scaling, so they are made at exactly that.
const MENU = 16;
const AMBER = '#d97a26';
const GLYPHS = {
	pause:
		'M216 48v160a16 16 0 0 1-16 16h-40a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h40a16 16 0 0 1 16 16M96 32H56a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h40a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16',
	resume:
		'M240 128a15.74 15.74 0 0 1-7.6 13.51L88.32 229.65a16 16 0 0 1-16.2.3A15.86 15.86 0 0 1 64 216.13V39.87a15.86 15.86 0 0 1 8.12-13.82a16 16 0 0 1 16.2.3l144.08 88.14A15.74 15.74 0 0 1 240 128'
};
const glyph = (d) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${MENU * SUPER}" height="${MENU * SUPER}" viewBox="16 16 224 224"><path fill="${AMBER}" d="${d}"/></svg>`;
const menu = [
	{ file: 'menu-open.png', svg: flameAlone('THREE', MENU * SUPER, { margin: 0.5 }) },
	{ file: 'menu-pause.png', svg: glyph(GLYPHS.pause) },
	{ file: 'menu-resume.png', svg: glyph(GLYPHS.resume) }
];
for (const { file, svg } of menu) {
	const out = fileURLToPath(new URL(`../src-tauri/icons/${file}`, import.meta.url));
	const big = await sharp(Buffer.from(svg)).png().toBuffer();
	await sharp(big).resize(MENU, MENU, { kernel: 'lanczos3' }).png().toFile(out);
	console.log(`wrote src-tauri/icons/${file}`);
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
