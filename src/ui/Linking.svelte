<script lang="ts">
	// Linking under way: the code to check against the page in the browser, and the page's address
	// for a player who would rather open it in another browser.

	import { SITE_NAME } from '../core/config.ts';
	import Icon from './Icon.svelte';

	let {
		linking,
		host,
		browser,
		oncopy,
		onreopen,
		oncancel
	}: {
		linking: { userCode: string; verifyUrl: string; opened: boolean };
		host: string;
		/** The default browser's name, when the computer says; null for "your browser". */
		browser: string | null;
		/** Puts the link on the clipboard; false if the system wouldn't allow it. */
		oncopy: (url: string) => Promise<boolean>;
		onreopen: () => void;
		oncancel: () => void;
	} = $props();

	let copied = $state(false);
	async function copy() {
		copied = await oncopy(linking.verifyUrl);
		if (copied) setTimeout(() => (copied = false), 2500);
	}
</script>

<section class="sheet card">
	{#if linking.opened}
		<h1 class="display">Check the code in {browser ?? 'your browser'}</h1>
		<p class="lead">
			A page on {host} has opened in {browser ?? 'your browser'}. It should show the code below. If it does,
			approve it there, and this window will carry on by itself.
		</p>
	{:else}
		<h1 class="display">Open this link in your browser</h1>
		<p class="lead">
			Copy the link into the browser you use for {SITE_NAME}. The page should show the code below.
			If it does, approve it there, and this window will carry on by itself.
		</p>
	{/if}
	<p class="display code figures">{linking.userCode}</p>
	<p class="address">{linking.verifyUrl}</p>
	<p class="actions">
		<button type="button" class="btn-alt" onclick={copy}>{copied ? 'Copied' : 'Copy the link'}</button>
		<button type="button" class="btn" onclick={onreopen}
			>{linking.opened ? 'Open the page again' : `Open it in ${browser ?? 'my usual browser'}`}
			<Icon name="out" size={13} /></button
		>
		<button type="button" class="link quiet" onclick={oncancel}>Cancel</button>
	</p>
	{#if linking.opened}
		<p class="aside">
			If that browser isn’t the one you’re signed in to {SITE_NAME} on, copy the link and open it in
			the one that is.
		</p>
	{/if}
</section>

<style>
	.card {
		padding: 20px 20px 18px;
	}
	h1 {
		font-size: 24px;
		font-weight: 600;
		line-height: 1.2;
	}
	.lead {
		margin-top: 8px;
		color: var(--ink-2);
	}
	.code {
		margin-top: 18px;
		font-size: 38px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: 0.08em;
		user-select: text;
	}
	.address {
		margin-top: 10px;
		font-size: 13.5px;
		color: var(--muted);
		overflow-wrap: anywhere;
		user-select: text;
		cursor: text;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		margin-top: 18px;
	}
	.actions .link {
		margin-left: 4px;
	}
	.aside {
		margin-top: 14px;
		font-size: 14px;
		color: var(--muted);
	}
</style>
