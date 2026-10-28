// Draws the app's own icon: the Widsith flame, the site's mark, in its four layers on a midnight
// disc. The same drawing as the tray's, with the layer that only shows when the mark is large.
//
//   npm run app-icon
//   npm run icons
//
// Writes src-tauri/app-icon.png at 1024×1024. The second command has Tauri's CLI make every size
// the installer and Windows ask for (src-tauri/icons/) from it. Run both once when the drawing
// changes; the pictures are kept in the repository. See flame.mjs for where `sharp` comes from.

import { fileURLToPath } from 'node:url';
import { findSharp, flameOnDisc } from './flame.mjs';

const sharp = findSharp();

const SIZE = 1024;
const out = fileURLToPath(new URL('../src-tauri/app-icon.png', import.meta.url));
await sharp(Buffer.from(flameOnDisc('FOUR', SIZE))).png().toFile(out);
console.log('wrote src-tauri/app-icon.png');
