// Parser for the data-only Lua subset WoW writes to SavedVariables files:
// top-level `Name = value` assignments whose values are tables, strings,
// numbers, booleans and nil. No expressions, no code. Comments are skipped.
//
// A recording can be tens of megabytes, almost all of it inside long chunk
// strings, so the scanner works on char codes and slices strings wholesale
// when they contain no escapes.

export type LuaValue = string | number | boolean | null | LuaValue[] | LuaTable;
export interface LuaTable {
	[key: string]: LuaValue;
}

export class LuaParseError extends Error {
	constructor(
		message: string,
		readonly offset: number
	) {
		super(`${message} (at offset ${offset})`);
		this.name = 'LuaParseError';
	}
}

const QUOTE = 34; // "
const APOSTROPHE = 39; // '
const BACKSLASH = 92;
const LBRACE = 123;
/** WoW writes at most a few levels; a crafted file with thousands would overflow the stack. */
const MAX_DEPTH = 64;
const LUA_NUMBER =
	/^-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)$/;
const RBRACE = 125;
const LBRACKET = 91;
const RBRACKET = 93;
const EQUALS = 61;
const COMMA = 44;
const SEMICOLON = 59;
const MINUS = 45;
const NEWLINE = 10;

const SIMPLE_ESCAPES: Record<string, string> = {
	n: '\n',
	t: '\t',
	r: '\r',
	a: '\x07',
	b: '\b',
	f: '\f',
	v: '\v',
	'\\': '\\',
	'"': '"',
	"'": "'",
	'\n': '\n'
};

function isDigit(code: number): boolean {
	return code >= 48 && code <= 57;
}

function isNameChar(code: number): boolean {
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || isDigit(code);
}

/** Parse every top-level assignment in a SavedVariables file. */
export function parseSavedVariables(source: string): Record<string, LuaValue> {
	let pos = 0;
	let depth = 0;
	const length = source.length;

	function fail(message: string): never {
		throw new LuaParseError(message, pos);
	}

	function skipTrivia(): void {
		while (pos < length) {
			const code = source.charCodeAt(pos);
			if (code <= 32 || code === 0xfeff) {
				pos++;
			} else if (code === MINUS && source.charCodeAt(pos + 1) === MINUS) {
				// Line comment. WoW never writes block comments.
				const end = source.indexOf('\n', pos);
				pos = end === -1 ? length : end + 1;
			} else {
				return;
			}
		}
	}

	function readName(): string {
		const start = pos;
		while (pos < length && isNameChar(source.charCodeAt(pos))) pos++;
		if (pos === start) fail('Expected a name');
		return source.slice(start, pos);
	}

	function readString(): string {
		const quote = source.charCodeAt(pos);
		pos++;
		let segmentStart = pos;
		let parts: string[] | null = null;
		// Decimal escapes are bytes; runs of bytes >= 128 are UTF-8 sequences.
		let bytes: number[] | null = null;

		const flushBytes = () => {
			if (bytes) {
				parts!.push(new TextDecoder().decode(new Uint8Array(bytes)));
				bytes = null;
			}
		};

		while (pos < length) {
			const code = source.charCodeAt(pos);
			if (code === quote) {
				const tail = source.slice(segmentStart, pos);
				pos++;
				if (!parts) return tail;
				flushBytes();
				parts.push(tail);
				return parts.join('');
			}
			if (code === NEWLINE) fail('Unterminated string');
			if (code !== BACKSLASH) {
				pos++;
				continue;
			}

			parts ??= [];
			if (pos > segmentStart) {
				flushBytes();
				parts.push(source.slice(segmentStart, pos));
			}
			pos++;
			const next = source[pos];
			if (next === undefined) fail('Unterminated string');
			if (isDigit(source.charCodeAt(pos))) {
				let digits = 0;
				let value = 0;
				while (digits < 3 && isDigit(source.charCodeAt(pos))) {
					value = value * 10 + (source.charCodeAt(pos) - 48);
					pos++;
					digits++;
				}
				if (value > 255) fail('Decimal escape out of range');
				if (value < 128) {
					flushBytes();
					parts.push(String.fromCharCode(value));
				} else {
					(bytes ??= []).push(value);
				}
			} else {
				flushBytes();
				const replacement = SIMPLE_ESCAPES[next];
				if (replacement === undefined) fail(`Unknown escape \\${next}`);
				parts.push(replacement);
				pos++;
			}
			segmentStart = pos;
		}
		return fail('Unterminated string');
	}

	function readNumber(): number {
		const start = pos;
		if (source.charCodeAt(pos) === MINUS) pos++;
		while (pos < length) {
			const code = source.charCodeAt(pos);
			// digits, '.', exponent markers and their signs, hex digits and the 'x' prefix
			const numeric =
				isDigit(code) ||
				code === 46 ||
				code === 43 ||
				code === MINUS ||
				(code >= 65 && code <= 70) ||
				(code >= 97 && code <= 102) ||
				code === 120 ||
				code === 88;
			if (!numeric) break;
			pos++;
		}
		const text = source.slice(start, pos);
		// Lua's own forms only — decimal, decimal fraction, exponent, or 0x hex — and finite: a
		// JavaScript-only spelling ("0b101") or an overflow ("1e400") is a bad file, not a value.
		const value = LUA_NUMBER.test(text) ? Number(text) : NaN;
		if (!Number.isFinite(value)) {
			pos = start;
			fail(`Invalid number "${text}"`);
		}
		return value;
	}

	function readTable(): LuaValue {
		if (++depth > MAX_DEPTH) fail(`Tables nested deeper than ${MAX_DEPTH}`);
		pos++; // {
		const record: LuaTable = {};
		let keyCount = 0;
		let nextIndex = 1;
		// A table is an array when its keys are exactly 1..n in order.
		let sequential = true;

		for (;;) {
			skipTrivia();
			if (pos >= length) fail('Unterminated table');
			let code = source.charCodeAt(pos);
			if (code === RBRACE) {
				pos++;
				depth--;
				break;
			}

			let key: string | number;
			if (code === LBRACKET) {
				pos++;
				skipTrivia();
				const keyValue = readValue();
				if (typeof keyValue !== 'string' && typeof keyValue !== 'number') {
					fail('Table keys must be strings or numbers');
				}
				key = keyValue as string | number;
				skipTrivia();
				if (source.charCodeAt(pos) !== RBRACKET) fail('Expected ]');
				pos++;
				skipTrivia();
				if (source.charCodeAt(pos) !== EQUALS) fail('Expected =');
				pos++;
				skipTrivia();
			} else {
				// Either `name = value` or a positional value.
				const mark = pos;
				let named = false;
				if (isNameChar(code) && !isDigit(code)) {
					const name = readName();
					skipTrivia();
					if (source.charCodeAt(pos) === EQUALS && source.charCodeAt(pos + 1) !== EQUALS) {
						pos++;
						skipTrivia();
						key = name;
						named = true;
					}
				}
				if (!named) {
					pos = mark;
					key = nextIndex;
				}
			}

			const value = readValue();
			if (key! === nextIndex) {
				nextIndex++;
			} else {
				sequential = false;
			}
			record[String(key!)] = value;
			keyCount++;

			skipTrivia();
			code = source.charCodeAt(pos);
			if (code === COMMA || code === SEMICOLON) pos++;
		}

		if (sequential && keyCount > 0) {
			const list: LuaValue[] = new Array(keyCount);
			for (let i = 0; i < keyCount; i++) list[i] = record[String(i + 1)];
			return list;
		}
		return record;
	}

	function readValue(): LuaValue {
		const code = source.charCodeAt(pos);
		if (code === LBRACE) return readTable();
		if (code === QUOTE || code === APOSTROPHE) return readString();
		if (code === MINUS || isDigit(code) || code === 46) return readNumber();
		const mark = pos;
		const word = readName();
		if (word === 'true') return true;
		if (word === 'false') return false;
		if (word === 'nil') return null;
		pos = mark;
		return fail(`Unexpected "${word}"`);
	}

	const result: Record<string, LuaValue> = {};
	for (;;) {
		skipTrivia();
		if (pos >= length) break;
		const name = readName();
		skipTrivia();
		if (source.charCodeAt(pos) !== EQUALS) fail('Expected =');
		pos++;
		skipTrivia();
		result[name] = readValue();
	}
	return result;
}

/** An empty Lua table is ambiguous; treat it as whichever shape the caller expects. */
export function asList(value: LuaValue | undefined): LuaValue[] {
	if (Array.isArray(value)) return value;
	return [];
}

/**
 * A Lua array that may have holes: Lua writes those with explicit [n] keys, so the parser sees a
 * table rather than a list. Its positive-integer entries, in key order.
 */
export function asIndexedList(value: LuaValue | undefined): LuaValue[] {
	if (Array.isArray(value)) return value;
	if (!value || typeof value !== 'object') return [];
	return Object.keys(value)
		.filter((key) => /^[1-9]\d*$/.test(key))
		.sort((a, b) => Number(a) - Number(b))
		.map((key) => value[key]);
}

export function asTable(value: LuaValue | undefined): LuaTable {
	if (value && typeof value === 'object' && !Array.isArray(value)) return value;
	return {};
}
