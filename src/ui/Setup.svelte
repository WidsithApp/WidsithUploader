<script lang="ts">
	// The start screen, shown once after linking: the account's characters with their switches (all
	// on) and a Start uploading button. Nothing new is sent until it's pressed.

	import { SITE_NAME } from '../core/config.ts';
	import type { CharacterView } from '../core/engine.ts';
	import { CLASSES } from './classes.ts';
	import Face from './Face.svelte';

	let {
		characters,
		battletag = null,
		onswitch,
		onstart
	}: {
		characters: CharacterView[];
		/** Set when the computer has more than one account. */
		battletag?: string | null;
		/** Same as the card's switch; takes effect immediately. */
		onswitch: (key: string, on: boolean) => Promise<void>;
		onstart: () => Promise<void>;
	} = $props();

	/** Forever first, then the others; by name within a game. */
	const ORDER = ['forever', 'retail', 'classic'];
	const rank = (c: CharacterView) => (c.game === null ? ORDER.length : ORDER.indexOf(c.game));
	// Earlier characters aren't listed: they stay off until switched on from their own card.
	const listed = $derived(
		characters
			.filter((c) => c.status !== 'unreadable' && c.status !== 'reading' && !c.former)
			.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
	);
	const isOn = (c: CharacterView) => c.status !== 'skipped' && c.status !== 'removed';
	const on = $derived(listed.filter(isOn).length);

	/** Key of the switch waiting on the engine. */
	let turning = $state<string | null>(null);
	async function turn(c: CharacterView) {
		turning = c.key;
		try {
			await onswitch(c.key, !isOn(c));
		} finally {
			turning = null;
		}
	}

	let starting = $state(false);
	async function start() {
		starting = true;
		try {
			await onstart();
		} finally {
			starting = false;
		}
	}

	/** "Steamwheedle Cartel · Retail", plus the site's status when it has one. */
	function under(c: CharacterView): string {
		const parts = [c.realm, c.gameLabel];
		if (c.status === 'kept') parts.push(`already on ${SITE_NAME}`);
		else if (c.status === 'removed') parts.push(`removed from ${SITE_NAME}`);
		else if (c.sessions === 0) parts.push('no play recorded yet');
		return parts.filter(Boolean).join(' · ');
	}
</script>

<section>
	<h1 class="display">
		{battletag ? `Start uploading ${battletag}’s characters` : 'Start uploading'}
	</h1>
	<p class="lead">
		Each character below is kept Private on {SITE_NAME}, and so is every character you play from now
		on. You can make any of them Public from its page on {SITE_NAME}. Switch off any you’d rather keep
		on this PC only.
	</p>

	<ul class="rows sheet">
		{#each listed as c (c.key)}
			{@const known = c.classID === null ? null : (CLASSES[c.classID] ?? null)}
			<li class:off={!isOn(c)}>
				<div class="face">
					<Face name={c.name} classID={c.classID} classIcon={c.classIcon} size={36} />
				</div>
				<div class="who">
					<span
						class="name display"
						class:known={known !== null}
						style:--class={known?.color ?? null}>{c.name}</span
					>
					<span class="under">{under(c)}</span>
				</div>
				<button
					type="button"
					class="switch"
					role="switch"
					aria-checked={isOn(c)}
					aria-label="Upload {c.name}"
					disabled={turning !== null || starting}
					onclick={() => turn(c)}><span></span></button
				>
			</li>
		{/each}
	</ul>

	<p class="go">
		<button type="button" class="btn-main" disabled={starting} onclick={start}>Start uploading</button>
		<span class="count">
			{on === listed.length
				? listed.length === 1
					? 'Your one character'
					: `All ${listed.length} characters`
				: `${on} of ${listed.length} characters`}, kept Private
		</span>
	</p>
</section>

<style>
	h1 {
		font-size: 26px;
		font-weight: 600;
		line-height: 1.2;
	}
	.lead {
		margin-top: 8px;
		color: var(--ink-2);
	}
	.rows {
		display: grid;
		margin-top: 18px;
		padding: 4px 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 14px;
	}
	li + li {
		border-top: 1px solid var(--rule);
	}
	li.off .face,
	li.off .who {
		opacity: 0.55;
		filter: saturate(0.4);
	}
	.who {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.name.known {
		color: color-mix(in oklab, var(--class) var(--class-share), var(--ink));
	}
	.under {
		color: var(--muted);
		font-size: 13px;
	}

	/* Same switch as Card.svelte's. */
	.switch {
		position: relative;
		flex: none;
		width: 36px;
		height: 20px;
		border-radius: 999px;
		background: var(--rule-2);
		transition: background var(--t-fast) var(--ease-out);
	}
	.switch[aria-checked='true'] {
		background: var(--accent);
	}
	.switch span {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
		transition: transform var(--t-fast) var(--ease-out);
	}
	.switch[aria-checked='true'] span {
		transform: translateX(16px);
	}

	.go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		margin-top: 18px;
	}
	.count {
		color: var(--muted);
		font-size: 14px;
	}
</style>
