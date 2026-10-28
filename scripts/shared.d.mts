// Types for shared.mjs, for the test that imports it.
export interface SharedFile {
	theirs: string;
	ours: string;
	comment: string[] | null;
}
export const SHARED: SharedFile[];
export function pathOf(relative: string): string;
export function siteRoot(): string | null;
export function theirsOf(file: SharedFile): string;
export function ours(text: string, comment: string[] | null): string;
