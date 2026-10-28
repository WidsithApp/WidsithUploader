// Writes THIRD-PARTY-NOTICES.txt: every open-source work the app is built from, each with its
// licence text as that work ships it. The installer puts the file beside the app.
//
//   npm run notices
//
// Run it again before a release whenever a dependency has changed. It reads:
//
// - The Rust crates compiled into the Windows app, from `cargo tree` (normal dependencies only, so
//   not the build tools), with each crate's licence and its LICENSE, COPYING and NOTICE files from
//   `cargo metadata`.
// - The npm packages the window's code is built with: package.json's `dependencies` and theirs,
//   from node_modules. Svelte is a devDependency, since it is a compiler, but its runtime ends up in
//   the window's code, and of its own dependencies only clsx goes with it; both are added here.
// - Phosphor Icons, whose drawings src/ui/Icon.svelte copies, written in by hand below.
//
// The file is sorted by name and version, so running this on an unchanged tree changes nothing. It
// is written with Windows line endings, like the other text files in a Windows checkout.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tauriDir = join(root, 'src-tauri');
const output = join(root, 'THIRD-PARTY-NOTICES.txt');

// Svelte's runtime and the one package it brings along, bundled although they are devDependencies.
const BUNDLED_FROM_DEV = ['svelte', 'clsx'];

// Phosphor Icons has no package here: Icon.svelte holds copies of its paths.
const PHOSPHOR = {
	name: 'Phosphor Icons',
	version: '',
	licence: 'MIT',
	note: "The window's small icons are drawn from Phosphor Icons' paths, the fill weight.",
	repository: 'https://github.com/phosphor-icons/core',
	texts: [
		{
			file: 'LICENSE',
			text: `MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
		}
	]
};

// A licence, copying or notice file, or a folder of them. A `.spdx` file is a machine-readable
// summary, not a licence text, so it doesn't count.
const LICENCE_NAME = /^(licen[cs]e|copying|notice)/i;

function licenceTexts(folder) {
	const found = [];
	const visit = (dir, prefix) => {
		for (const name of readdirSync(dir).sort()) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) {
				if (!prefix && LICENCE_NAME.test(name)) visit(path, name + '/');
			} else if ((prefix || LICENCE_NAME.test(name)) && !/\.spdx$/i.test(name)) {
				found.push({ file: prefix + name, text: readFileSync(path, 'utf8') });
			}
		}
	};
	visit(folder, '');
	return found;
}

function tidy(text) {
	return text
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+$/gm, '')
		.replace(/^\n+/, '')
		.replace(/\n+$/, '');
}

function repositoryOf(value) {
	const url = typeof value === 'string' ? value : value?.url;
	if (!url) return '';
	return url
		.replace(/^git\+/, '')
		.replace(/^git:\/\//, 'https://')
		.replace(/^github:/, 'https://github.com/')
		.replace(/\.git$/, '');
}

function compareVersions(a, b) {
	const x = a.split(/[.+-]/);
	const y = b.split(/[.+-]/);
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		if (x[i] === y[i]) continue;
		if (x[i] === undefined) return -1;
		if (y[i] === undefined) return 1;
		const m = /^\d+$/.test(x[i]);
		const n = /^\d+$/.test(y[i]);
		if (m && n) return Number(x[i]) - Number(y[i]);
		return x[i] < y[i] ? -1 : 1;
	}
	return 0;
}

const byNameThenVersion = (a, b) =>
	a.name === b.name ? compareVersions(a.version, b.version) : a.name < b.name ? -1 : 1;

// Rust ------------------------------------------------------------------------------------------

function cargo(args) {
	return execFileSync('cargo', args, {
		cwd: tauriDir,
		encoding: 'utf8',
		maxBuffer: 512 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'inherit']
	});
}

function rustCrates() {
	const metadata = JSON.parse(cargo(['metadata', '--format-version', '1', '--locked']));
	const own = new Set(metadata.workspace_members);
	const packages = new Map();
	for (const p of metadata.packages) {
		if (!own.has(p.id)) packages.set(`${p.name} ${p.version}`, p);
	}

	const tree = cargo([
		'tree',
		'--locked',
		'-e',
		'normal',
		'--target',
		'x86_64-pc-windows-msvc',
		'--prefix',
		'none',
		'--format',
		'{p}'
	]);
	const wanted = new Set();
	for (const line of tree.split(/\r?\n/)) {
		const match = /^(\S+) v(\S+)/.exec(line.trim());
		if (match) wanted.add(`${match[1]} ${match[2]}`);
	}

	const crates = [];
	for (const key of wanted) {
		const p = packages.get(key);
		if (!p) continue; // the app's own crate
		const folder = dirname(p.manifest_path);
		const texts = licenceTexts(folder);
		if (p.license_file) {
			const named = p.license_file.split('\\').join('/');
			const path = join(folder, named);
			if (!texts.some((t) => t.file === named) && existsSync(path)) {
				texts.push({ file: named, text: readFileSync(path, 'utf8') });
			}
		}
		crates.push({
			name: p.name,
			version: p.version,
			licence: p.license ?? (p.license_file ? 'see the licence file' : 'not stated'),
			authors: p.authors ?? [],
			repository: repositoryOf(p.repository),
			texts
		});
	}
	return crates.sort(byNameThenVersion);
}

// npm -------------------------------------------------------------------------------------------

function resolvePackage(name, fromDir) {
	let dir = fromDir;
	for (;;) {
		const candidate = join(dir, 'node_modules', name);
		if (existsSync(join(candidate, 'package.json'))) return candidate;
		const up = dirname(dir);
		if (up === dir || !up.startsWith(root.replace(/[\\/]$/, ''))) return null;
		dir = up;
	}
}

function licenceOf(pkg) {
	if (typeof pkg.license === 'string') return pkg.license;
	if (pkg.license?.type) return pkg.license.type;
	if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
	return 'not stated';
}

function authorsOf(pkg) {
	const person = (p) => (typeof p === 'string' ? p : [p?.name, p?.email && `<${p.email}>`].filter(Boolean).join(' '));
	return [pkg.author, ...(pkg.contributors ?? [])].filter(Boolean).map(person).filter(Boolean);
}

function npmPackages() {
	const app = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const found = new Map();
	const missing = [];
	const visit = (name, fromDir, walk) => {
		const folder = resolvePackage(name, fromDir);
		if (!folder) {
			missing.push(name);
			return;
		}
		const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
		const key = `${pkg.name} ${pkg.version}`;
		if (found.has(key)) return;
		found.set(key, {
			name: pkg.name,
			version: pkg.version,
			licence: licenceOf(pkg),
			authors: authorsOf(pkg),
			repository: repositoryOf(pkg.repository),
			texts: licenceTexts(folder)
		});
		if (walk) for (const dep of Object.keys(pkg.dependencies ?? {}).sort()) visit(dep, folder, true);
	};
	for (const name of Object.keys(app.dependencies ?? {}).sort()) visit(name, root, true);
	for (const name of BUNDLED_FROM_DEV) visit(name, root, false);
	if (missing.length) {
		console.error(`Not installed: ${missing.join(', ')}. Run npm install first.`);
		process.exit(1);
	}
	return [...found.values()].sort(byNameThenVersion);
}

// The file --------------------------------------------------------------------------------------

const RULE = '='.repeat(78);

function section(work, related) {
	const title = [work.name, work.version].filter(Boolean).join(' ');
	const lines = [RULE, title, `Licence: ${work.licence}`];
	if (work.authors?.length) lines.push(`Authors: ${work.authors.join(', ')}`);
	if (work.repository) lines.push(`Source: ${work.repository}`);
	lines.push(RULE, '');
	if (work.note) lines.push(work.note, '');
	if (work.texts.length === 0) {
		lines.push(`This work ships no licence file. It is licensed under ${work.licence}.`);
		if (related) {
			lines.push(`The licence texts are those given above for ${related.name} ${related.version}, from the same source.`);
		} else if (work.repository) {
			lines.push(`The licence is published with its source at ${work.repository}.`);
		}
		lines.push('');
	}
	for (const { file, text } of work.texts) {
		if (work.texts.length > 1) lines.push(`--- ${file} ---`, '');
		lines.push(tidy(text), '');
	}
	return lines.join('\n');
}

const crates = rustCrates();
const packages = npmPackages();
const others = [PHOSPHOR];

// An npm package with no licence file of its own may share its source with a Rust crate that has
// one: @tauri-apps/plugin-dialog and tauri-plugin-dialog, say. The crate whose name ends the same
// way is preferred.
function relatedCrate(pkg) {
	const same = crates.filter((c) => c.repository && c.repository === pkg.repository && c.texts.length);
	const base = pkg.name.split('/').pop();
	return same.find((c) => c.name.endsWith(base)) ?? same[0];
}

const heading = [
	'Widsith Uploader: third-party notices',
	'',
	'Widsith Uploader is built from the open-source works listed below, each used under its own',
	'licence. Each section names a work, its version where it has one, and its licence, and gives',
	"the licence text as the work ships it. The app's own licence is in LICENSE.txt.",
	'',
	`Rust crates: ${crates.length}. npm packages: ${packages.length}. Other works: ${others.length}.`,
	''
].join('\n');

const parts = [heading, `${RULE}\nRUST CRATES\n`];
for (const c of crates) parts.push(section(c));
parts.push(`${RULE}\nNPM PACKAGES\n`);
for (const p of packages) parts.push(section(p, p.texts.length ? null : relatedCrate(p)));
parts.push(`${RULE}\nOTHER WORKS\n`);
for (const o of others) parts.push(section(o));

const text = parts.join('\n').replace(/\n+$/, '\n').replace(/\n/g, '\r\n');
writeFileSync(output, text, 'utf8');

const lacking = (list) => list.filter((w) => w.texts.length === 0).map((w) => `${w.name} ${w.version} (${w.licence})`);
const lackingCrates = lacking(crates);
const lackingPackages = lacking(packages);
console.log(`THIRD-PARTY-NOTICES.txt: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
console.log(`  Rust crates: ${crates.length}, of which ${lackingCrates.length} ship no licence file`);
for (const w of lackingCrates) console.log(`    ${w}`);
console.log(`  npm packages: ${packages.length}, of which ${lackingPackages.length} ship no licence file`);
for (const w of lackingPackages) console.log(`    ${w}`);
console.log(`  Other works: ${others.length}`);
