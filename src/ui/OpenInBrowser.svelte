<script lang="ts">
	// A page on the site that the player must be signed in to see, offered the one way: the main
	// button names the browser it opens in, since a page opened in a browser they aren't signed in
	// on shows them nothing of theirs, and a quiet link beside it copies the address for the browser
	// they are. The card's View and the link step use it; a public page keeps the arrow alone.

	import Icon from './Icon.svelte';

	let {
		words,
		url,
		browser,
		main = true,
		onopen,
		oncopy
	}: {
		/** What the button says before the browser's name: "View" makes "View in Chrome". */
		words: string;
		url: string;
		/** The default browser's name, when the computer says; null for "your browser". */
		browser: string | null;
		/** The gold button for a view's main action; the outline for another. */
		main?: boolean;
		onopen: (url: string) => void;
		/** Puts the address on the clipboard; false if the system wouldn't allow it. */
		oncopy: (text: string) => Promise<boolean>;
	} = $props();

	let copied = $state(false);
	async function copy() {
		copied = await oncopy(url);
		if (copied) setTimeout(() => (copied = false), 2500);
	}
</script>

<button type="button" class={main ? 'btn-main' : 'btn-alt'} onclick={() => onopen(url)}
	>{words} in {browser ?? 'your browser'} <Icon name="out" size={13} /></button
>
<button type="button" class="link quiet" onclick={copy}>{copied ? 'Copied' : 'Copy the link'}</button>
