<script module lang="ts">
	export type Tab = 'characters' | 'settings';
</script>

<script lang="ts">
	// The window's one row at the top: the flame and the name, and once the computer is linked the
	// two views and who it is linked to. The views are words, as the site's sections are; the
	// current one is underlined in sealing-wax red, and one pointed at draws an accent line in.

	import { SITE_NAME } from '../core/config.ts';
	import Logo from './Logo.svelte';

	let {
		tabs,
		tab,
		battletag,
		ontab
	}: {
		/** Whether the two views are offered: whenever the first look is done and nothing is being asked. */
		tabs: boolean;
		tab: Tab;
		battletag: string | null;
		ontab: (tab: Tab) => void;
	} = $props();

	const TABS: { id: Tab; label: string }[] = [
		{ id: 'characters', label: 'Characters' },
		{ id: 'settings', label: 'Settings' }
	];
</script>

<header>
	<div class="brand">
		<Logo size={34} />
		<span class="lockup">
			<span class="wordmark">{SITE_NAME}</span>
			<span class="what">Uploader</span>
		</span>
	</div>
	{#if tabs}
		<nav aria-label="Views">
			{#each TABS as item (item.id)}
				<button
					type="button"
					class="tab"
					class:current={tab === item.id}
					aria-current={tab === item.id ? 'page' : undefined}
					onclick={() => ontab(item.id)}>{item.label}</button
				>
			{/each}
		</nav>
	{/if}
	{#if battletag}
		<span class="who" title={battletag} aria-label="Linked as {battletag}">{battletag.slice(0, 1).toUpperCase()}</span>
	{/if}
</header>

<style>
	header {
		position: relative;
		display: flex;
		flex: none;
		align-items: center;
		gap: 14px;
		height: 56px;
		/* Room on the left for the map the flame stands on to fade out before the window's edge. */
		padding: 0 18px 0 24px;
		border-bottom: 1px solid var(--rule-2);
		background: var(--paper);
	}
	/* A thin rule under it, from sealing-wax red through the accent to nothing. */
	header::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: linear-gradient(90deg, var(--seal), var(--accent) 45%, transparent 75%);
		opacity: 0.55;
		pointer-events: none;
	}
	.brand {
		display: flex;
		flex: none;
		align-items: center;
		gap: 8px;
	}
	.brand :global(.logo) {
		filter: drop-shadow(0 2px 6px rgb(224 138 43 / 0.35));
	}
	.wordmark {
		font-family: var(--display);
		font-optical-sizing: auto;
		font-style: italic;
		font-weight: 600;
		font-size: 24px;
		line-height: 1;
		letter-spacing: -0.01em;
	}
	/* The product's name under the wordmark, small and spaced, the way the site writes a caption. */
	.lockup {
		display: flex;
		align-items: baseline;
		gap: 9px;
	}
	.what {
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	/* The row needs about 460 pixels. The window is never narrower than 520, but one opened on a
	   screen at 100% and dragged to one at 125% can be: the caption steps aside rather than the row
	   running off the window's edge. */
	@media (max-width: 470px) {
		.what {
			display: none;
		}
	}
	nav {
		display: flex;
		align-self: stretch;
		margin-left: auto;
	}
	.tab {
		position: relative;
		padding: 0 9px;
		color: var(--ink-2);
		font-weight: 500;
		transition: color var(--t-fast) var(--ease-out);
	}
	.tab::after {
		content: '';
		position: absolute;
		left: 9px;
		right: 9px;
		bottom: -1px;
		height: 2px;
		background: var(--accent);
		clip-path: inset(0 100% 0 0);
		transition: clip-path var(--t-fast) var(--ease-out);
	}
	.tab:hover,
	.tab:focus-visible {
		color: var(--ink);
	}
	.tab:hover::after,
	.tab:focus-visible::after {
		clip-path: inset(0 0 0 0);
	}
	.tab.current {
		color: var(--ink);
	}
	.tab.current::after {
		background: var(--seal);
		clip-path: inset(0 0 0 0);
		transition: none;
	}
	/* Who the computer is linked to: the account's initial in an accent disc, the name on hover,
	   as the site's header shows a signed-in player. */
	.who {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: 13px;
		font-weight: 700;
		cursor: default;
	}
	/* With no views offered, the BattleTag keeps to the right on its own. */
	.brand + .who {
		margin-left: auto;
	}
</style>
