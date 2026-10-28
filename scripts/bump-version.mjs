// Raises the app's version in every file that carries it, for a release:
//
//   node scripts/bump-version.mjs 0.2.1      a version
//   node scripts/bump-version.mjs patch      0.2.0 -> 0.2.1
//   node scripts/bump-version.mjs minor      0.2.0 -> 0.3.0
//   node scripts/bump-version.mjs major      0.2.0 -> 1.0.0
//
// The files are package.json, package-lock.json (twice), src-tauri/tauri.conf.json,
// src-tauri/Cargo.toml and src-tauri/Cargo.lock. Each keeps its line endings. The new version must
// be higher than the one there now: a release that isn't newer would never be offered as an update.
// Prints the new version alone, so a script can read it. The release script (scripts/release.ps1)
// runs this; it is rarely run by hand.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = (file) => root + file;

function parse(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
	return match ? match.slice(1).map(Number) : null;
}

const current = JSON.parse(readFileSync(at('package.json'), 'utf8')).version;
const now = parse(current);
if (!now) {
	console.error(`package.json's version, "${current}", isn't three numbers.`);
	process.exit(1);
}

const asked = process.argv[2];
let next;
if (asked === 'major') next = [now[0] + 1, 0, 0];
else if (asked === 'minor') next = [now[0], now[1] + 1, 0];
else if (asked === 'patch') next = [now[0], now[1], now[2] + 1];
else next = parse(asked);
if (!next) {
	console.error(
		`Say which version: a number like 0.2.1, or patch, minor or major. The app is ${current}.`
	);
	process.exit(1);
}
const higher =
	next[0] > now[0] ||
	(next[0] === now[0] && (next[1] > now[1] || (next[1] === now[1] && next[2] > now[2])));
if (!higher) {
	console.error(
		`${next.join('.')} isn't newer than ${current}, so no installed copy would take it as an update.`
	);
	process.exit(1);
}
const version = next.join('.');

/**
 * Replaces `from` with `to` in a file exactly `times` times, keeping its line endings. `from` and
 * `to` may contain "\n" where the file's own line break goes.
 */
function replace(file, from, to, times) {
	const text = readFileSync(at(file), 'utf8');
	const nl = text.includes('\r\n') ? '\r\n' : '\n';
	const needle = from.replaceAll('\n', nl);
	const count = text.split(needle).length - 1;
	if (count !== times) {
		console.error(`${file}: expected ${times} place(s) to change, found ${count}. Nothing was changed.`);
		process.exit(1);
	}
	writeFileSync(at(file), text.split(needle).join(to.replaceAll('\n', nl)));
}

replace('package.json', `"version": "${current}"`, `"version": "${version}"`, 1);
replace('package-lock.json', `"version": "${current}"`, `"version": "${version}"`, 2);
replace('src-tauri/tauri.conf.json', `"version": "${current}"`, `"version": "${version}"`, 1);
replace('src-tauri/Cargo.toml', `version = "${current}"`, `version = "${version}"`, 1);
replace(
	'src-tauri/Cargo.lock',
	`name = "widsith-uploader"\nversion = "${current}"`,
	`name = "widsith-uploader"\nversion = "${version}"`,
	1
);

console.log(version);
