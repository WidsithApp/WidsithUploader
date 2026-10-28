<script lang="ts">
	// A character's avatar: the class icon (or first letter until it loads) in a class-coloured
	// ring, with the level badge when the site knows it.
	//
	// `loaded` stores the URL that loaded rather than a boolean: the view re-renders on every scan,
	// and an already-loaded image doesn't fire `onload` again, so a reset flag would hide it for good.

	import { CLASSES } from './classes.ts';

	let {
		name,
		classID,
		classIcon,
		level = null,
		size = 48
	}: {
		name: string;
		classID: number | null;
		classIcon: string | null;
		level?: number | null;
		/** Diameter in px. */
		size?: number;
	} = $props();

	const known = $derived(classID === null ? null : (CLASSES[classID] ?? null));
	/** Null for an unknown class, which falls back to the rule colour. */
	const color = $derived(known?.color ?? null);
	const letter = $derived((known?.name ?? name).slice(0, 1).toUpperCase());

	let loaded = $state<string | null>(null);
</script>

<div
	class="face"
	class:known={color !== null}
	class:small={size < 44}
	style:--class={color}
	style:--size="{size}px"
>
	<span class="letter" aria-hidden="true">{letter}</span>
	{#if classIcon}
		<img
			src={classIcon}
			alt=""
			class:shown={loaded === classIcon}
			onload={() => (loaded = classIcon)}
			onerror={() => (loaded = null)}
		/>
	{/if}
	{#if level !== null}
		<span class="level figures" aria-hidden="true">{level}</span>
	{/if}
</div>

<style>
	.face {
		position: relative;
		flex: none;
		width: var(--size);
		height: var(--size);
		border: 3px solid var(--rule-2);
		border-radius: 50%;
		background: var(--paper-2);
	}
	.face.small {
		border-width: 2px;
	}
	.face.known {
		border-color: var(--class);
	}
	.letter {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--display);
		font-size: calc(var(--size) * 0.42);
		font-weight: 600;
		line-height: 1;
		color: var(--muted);
	}
	.face.known .letter {
		color: color-mix(in oklab, var(--class) var(--class-share), var(--ink));
	}
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		opacity: 0;
		transition: opacity var(--t-base) var(--ease-out);
	}
	img.shown {
		opacity: 1;
	}
	.level {
		position: absolute;
		right: -7px;
		bottom: -5px;
		min-width: 22px;
		padding: 1px 5px;
		border: 1px solid var(--rule-2);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		font-size: 11px;
		font-weight: 600;
		line-height: 14px;
		text-align: center;
	}
</style>
