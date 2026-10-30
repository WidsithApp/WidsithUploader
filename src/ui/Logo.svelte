<script lang="ts">
	// The Widsith mark from the site's header: one outline drawn four times, scaled in from the
	// base, dark to light (three times under 24 px, where the fourth turns to mush). From 32 px it
	// stands on a small map, a dashed road winding in to its base between contour lines, fading out
	// before any edge shows; `map={false}` draws the flame alone. Animation stops under reduced
	// motion. Copied from the site by `npm run shared`; a test fails if they drift.

	let {
		size = 40,
		spark = false,
		map = true
	}: { size?: number; spark?: boolean; map?: boolean } = $props();
	const uid = $props.id();

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

	/* The map is drawn in the avatar's 512-unit square, where the flame stands at
	   translate(133 159) scale(4.6); MAP_TRANSFORM brings it back to the flame's 64-unit box. */
	const MAP_TRANSFORM = 'scale(0.2174) translate(-133 -159)';
	/** In from the top left, down the left side and in under the flame, ending inside its base. */
	const ROAD =
		'M-30 104 C60 84 150 104 140 172 C130 240 44 236 56 312 C66 380 160 360 176 424 C188 470 250 476 272 412';

	/** Nested uneven rings around a hill top, like contour lines; `h` shapes them. */
	function hill(cx: number, cy: number, radii: number[], h: number[]): string[] {
		return radii.map((r, k) => {
			const points: string[] = [];
			for (let i = 0; i < 90; i++) {
				const t = (i / 90) * Math.PI * 2;
				const w =
					1 +
					h[0] * Math.sin(2 * t + h[1] + k * 0.25) +
					h[2] * Math.sin(3 * t + h[3] - k * 0.18) +
					0.05 * Math.sin(5 * t + k * 0.6);
				points.push(
					`${(cx + r * w * Math.cos(t)).toFixed(1)},${(cy + r * w * 0.82 * Math.sin(t)).toFixed(1)}`
				);
			}
			return points.join(' ');
		});
	}
	const RINGS = [
		...hill(450, 80, [34, 82, 132], [0.14, 0.4, 0.08, 1.9]),
		...hill(490, 500, [44, 98], [0.12, 2.2, 0.1, 0.4]),
		...hill(-6, 330, [40, 92], [0.1, 1.1, 0.12, 2.7])
	];
</script>

<svg
	viewBox="0 0 64 64"
	width={size}
	height={size}
	class={['logo flame shrink-0 overflow-visible', spark && 'sparking']}
	aria-hidden="true"
>
	{#if map && size >= 32}
		<defs>
			<!-- An ellipse left of the flame, wider than tall: gone a third of the mark above and below
			     (inside the header's row) and before the wordmark on the right. -->
			<radialGradient
				id="{uid}-fade"
				cx="0"
				cy="0"
				r="1"
				gradientUnits="userSpaceOnUse"
				gradientTransform="translate(206 306) scale(285 221)"
			>
				<stop offset="0.45" stop-color="#fff" />
				<stop offset="1" stop-color="#fff" stop-opacity="0" />
			</radialGradient>
			<mask id="{uid}-map" maskUnits="userSpaceOnUse" x="-60" y="-60" width="632" height="632">
				<rect x="-60" y="-60" width="632" height="632" fill="url(#{uid}-fade)" />
			</mask>
		</defs>
		<g class="map" transform={MAP_TRANSFORM} mask="url(#{uid}-map)">
			{#each RINGS as points, i (i)}<polygon class="ring" {points} />{/each}
			<path class="road" d={ROAD} />
		</g>
	{/if}
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
	/* The road is red by day and gold by night, as on the avatar. */
	.ring {
		fill: none;
		stroke: var(--ink, #2b2433);
		stroke-opacity: 0.16;
		stroke-width: 7;
		stroke-linejoin: round;
	}
	.road {
		fill: none;
		stroke: var(--seal, #b3402b);
		stroke-opacity: 0.8;
		stroke-width: 15;
		stroke-linecap: round;
		stroke-dasharray: 22 24;
	}
	:global(html[data-theme='dark']) .road {
		stroke: var(--gold, #e6b457);
	}
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
