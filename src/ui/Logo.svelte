<script lang="ts">
	// The Widsith flame from the site's header: one outline drawn four times, scaled in from the
	// base, dark to light (three times under 24 px, where the fourth turns to mush). Animation stops
	// under reduced motion. Copied from the site by `npm run shared`; a test fails if they drift.

	let { size = 40, spark = false }: { size?: number; spark?: boolean } = $props();

	/** The flame's outline in a 64-unit box; every layer is this, scaled about the base centre. */
	const OUTLINE =
		'M39 3 C42 14 53 22 53 38 C53 51 44 61 32 61 C20 61 11 52 11 41 C11 32 15 27 19 19 C20.5 25 23 29 27 31 C25.5 21 30 12 39 3 Z';
	/** An ember: a small diamond at the tip. */
	const EMBER = 'M39 3 l2.2 2.2 -2.2 2.2 -2.2 -2.2 Z';

	/** Outer to inner. `l0` stays still; the other classes animate. */
	const FOUR = [
		{ scale: 1, fill: '#b9521a', cls: 'l0' },
		{ scale: 0.8, fill: '#e08a2b', cls: 'l1' },
		{ scale: 0.58, fill: '#f4b04a', cls: 'l2' },
		{ scale: 0.34, fill: '#fff4d6', cls: 'l3' }
	];
	const THREE = [
		{ scale: 1, fill: '#b9521a', cls: 'l0' },
		{ scale: 0.72, fill: '#f4b04a', cls: 'l2' },
		{ scale: 0.42, fill: '#fff4d6', cls: 'l3' }
	];
	const layers = $derived(size < 24 ? THREE : FOUR);
</script>

<svg
	viewBox="0 0 64 64"
	width={size}
	height={size}
	class={['logo flame shrink-0 overflow-visible', spark && 'sparking']}
	aria-hidden="true"
>
	<!-- One group per layer: the animation scales the group, so the path keeps its own transform. -->
	{#each layers as layer (layer.cls)}
		<g class={layer.cls}>
			<path
				d={OUTLINE}
				fill={layer.fill}
				transform="translate(32 61) scale({layer.scale}) translate(-32 -61)"
			/>
		</g>
	{/each}
	<path class="ember e1" d={EMBER} fill="#f4b04a" />
	<path class="ember e2" d={EMBER} fill="#fff4d6" />
</svg>

<style>
	/* Breathing, every 4.2 s from the base centre: l1 to 1.04, l2 and l3 to 1.1, l3 slightly later. */
	.l1,
	.l2,
	.l3 {
		transform-box: view-box;
		transform-origin: 32px 61px;
		animation: breathe 4.2s ease-in-out infinite;
	}
	.l1 {
		--to: 1.04;
	}
	.l2,
	.l3 {
		--to: 1.1;
	}
	.l3 {
		animation-delay: 0.3s;
	}
	.ember {
		opacity: 0;
		transform-box: view-box;
		transform-origin: 39px 3px;
	}
	/* Spark: a second animation on the same layers, so the breathing continues underneath. Every
	   3.6 s the inner layers flare in turn and two embers rise from the tip and fade. It always
	   runs; hovering adds nothing. */
	.l1,
	.l2,
	.l3 {
		animation:
			breathe 4.2s ease-in-out infinite,
			spark 3.6s ease-out infinite;
	}
	.l2 {
		animation-delay: 0s, 0.05s;
	}
	.l3 {
		animation-delay: 0.3s, 0.1s;
	}
	.e1 {
		animation: ember-right 3.6s ease-out infinite;
	}
	.e2 {
		animation: ember-left 3.6s ease-out 0.35s infinite;
	}
	@keyframes breathe {
		50% {
			transform: scale(var(--to, 1.03));
		}
	}
	@keyframes spark {
		9% {
			transform: scale(1.08, 1.15);
		}
		22%,
		100% {
			transform: none;
		}
	}
	@keyframes ember-right {
		0% {
			opacity: 1;
			transform: translate(0, 0) scale(1);
		}
		30%,
		100% {
			opacity: 0;
			transform: translate(9px, -16px) scale(0.5);
		}
	}
	@keyframes ember-left {
		0% {
			opacity: 1;
			transform: translate(0, 0) scale(1);
		}
		33%,
		100% {
			opacity: 0;
			transform: translate(-8px, -18px) scale(0.5);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.flame * {
			animation: none !important;
		}
	}
</style>
