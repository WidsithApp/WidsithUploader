// Times and durations as the window says them.

/** Days between the calendar day of `ms` and today: 0 today, 1 yesterday. */
function daysAgo(ms: number): number {
	const today = new Date().setHours(0, 0, 0, 0);
	return Math.round((today - new Date(ms).setHours(0, 0, 0, 0)) / 86400000);
}

/** "today", "yesterday", "3 October", and "3 October 2025" for an earlier year. */
export function day(ms: number): string {
	const days = daysAgo(ms);
	if (days === 0) return 'today';
	if (days === 1) return 'yesterday';
	const then = new Date(ms);
	const sameYear = then.getFullYear() === new Date().getFullYear();
	return then.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: sameYear ? undefined : 'numeric'
	});
}

/**
 * How long ago, as a person says it: "just now", "4 minutes ago", "3 hours ago", "yesterday",
 * "5 days ago", and the date once it is more than a fortnight back.
 */
export function ago(ms: number): string {
	const minutes = Math.round((Date.now() - ms) / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24 && daysAgo(ms) === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
	const days = daysAgo(ms);
	if (days <= 1) return 'yesterday';
	if (days < 14) return `${days} days ago`;
	return `on ${day(ms)}`;
}

/** "today at 21:14", "yesterday at 09:02", "3 October at 21:14". */
export function moment(ms: number): string {
	const time = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	return `${day(ms)} at ${time}`;
}

/** Time played as the game's own clock reads: "12h 52m", or "40m" under an hour. */
export function played(ms: number): string {
	const minutes = Math.floor(ms / 60000);
	const hours = Math.floor(minutes / 60);
	return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
