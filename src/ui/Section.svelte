<script lang="ts">
	// One card of the settings, in the form the site's account settings use: one subject, its
	// title in Fraunces with one plain sentence of what it is under a rule, and what belongs to it
	// beneath. The rows, notes and actions inside are styled here so every tab reads the same.

	import type { Snippet } from 'svelte';

	let {
		title,
		line,
		children
	}: {
		title: string;
		/** One plain sentence saying what the card is. */
		line: string;
		/** What belongs to it; a card whose sentence says it all has none. */
		children?: Snippet;
	} = $props();
</script>

<section class="sheet card">
	<div class="sect" class:alone={!children}>
		<h2 class="display">{title}</h2>
		<p>{line}</p>
	</div>
	{#if children}
		<div class="body">
			{@render children()}
		</div>
	{/if}
</section>

<style>
	.card {
		display: grid;
		align-content: start;
		padding: 16px 18px 18px;
	}
	.card + :global(.card) {
		margin-top: 14px;
	}
	.sect {
		display: grid;
		gap: 3px;
		margin-bottom: 12px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--rule);
	}
	.sect.alone {
		margin-bottom: 0;
		padding-bottom: 0;
		border-bottom: 0;
	}
	h2 {
		font-size: 19px;
		font-weight: 600;
		line-height: 1.25;
	}
	.sect p {
		color: var(--ink-2);
	}
	.body {
		display: grid;
		gap: 12px;
		color: var(--ink-2);
	}
	.body :global(b) {
		color: var(--ink);
		font-weight: 600;
	}
	/* A quieter line. */
	.body :global(.note) {
		font-size: 13.5px;
		color: var(--muted);
	}
	/* A line that is a row: what it says, and its control at the right end. */
	.body :global(.row) {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.body :global(.row > :first-child) {
		flex: 1;
		min-width: 0;
		color: var(--ink);
	}
	.body :global(.row .note) {
		display: block;
		margin-top: 1px;
	}
	/* A short list of things, each with its mark. */
	.body :global(.marked) {
		display: grid;
		gap: 10px;
	}
	.body :global(.marked li) {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}
	.body :global(.marked svg) {
		flex: none;
		margin-top: 2px;
		color: var(--accent);
	}
	.body :global(.actions) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
	}
	.body :global(.trouble) {
		color: var(--seal);
	}
</style>
