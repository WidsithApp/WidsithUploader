// Addon versions, compared as the numbers between their dots: 0.2.9 is older than 0.2.14.

function parts(version: string): number[] {
	return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

/** Whether `installed` is older than `latest`. */
export function isOlder(installed: string, latest: string): boolean {
	const a = parts(installed);
	const b = parts(latest);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const difference = (a[i] ?? 0) - (b[i] ?? 0);
		if (difference !== 0) return difference < 0;
	}
	return false;
}

/** A game folder's name as a player would say it: `_classic_era_` is "Classic Era". */
export function flavorName(folder: string): string {
	const words = folder.replace(/^_+|_+$/g, '').split('_').filter(Boolean);
	if (words.length === 0) return folder;
	return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}
