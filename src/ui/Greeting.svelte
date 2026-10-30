<script lang="ts">
	// The first thing a new install shows, once: what the app does, whether it starts with Windows
	// (ticked, since the point of it is that nobody has to remember it), and that closing the window
	// leaves it in the tray, with the way to keep its icon in view. Continue goes on to linking.

	import { SITE_NAME } from '../core/config.ts';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';

	let {
		oncontinue,
		ontaskbar
	}: {
		/** With whether the player wants the app to start with Windows. */
		oncontinue: (startsWithWindows: boolean) => Promise<void>;
		ontaskbar: () => void;
	} = $props();

	let starts = $state(true);
	let going = $state(false);
	async function go() {
		going = true;
		try {
			await oncontinue(starts);
		} finally {
			going = false;
		}
	}
</script>

<section>
	<h1 class="display">Welcome to {SITE_NAME} Uploader</h1>
	<p class="lead">
		The {SITE_NAME} addon records your play in the game. This app notices each new recording and
		sends it to {SITE_NAME} for you.
	</p>

	<h2 class="display">When it runs</h2>
	<label class="check">
		<input type="checkbox" bind:checked={starts} disabled={going} />
		<span>Start when I sign in to Windows, so nothing waits to be sent</span>
	</label>

	<h2 class="display">In the tray</h2>
	<p class="lead">
		Closing this window doesn’t quit the app. It keeps running in the tray beside the clock, where
		its flame <span class="flame"><Logo size={16} /></span> opens this window again. Right-click the
		flame to pause or quit.
	</p>
	<p class="lead">
		If you don’t see the flame, Windows may have tucked it behind the arrow beside the clock. You
		can keep it in view from the taskbar settings.
	</p>
	<p class="actions">
		<button type="button" class="btn" onclick={ontaskbar}
			>Open taskbar settings <Icon name="out" size={13} /></button
		>
	</p>

	<p class="go">
		<button type="button" class="btn-main" disabled={going} onclick={go}>Continue</button>
	</p>
</section>

<style>
	h1 {
		font-size: 26px;
		font-weight: 600;
		line-height: 1.2;
	}
	h2 {
		margin-top: 26px;
		font-size: 19px;
		font-weight: 600;
		line-height: 1.25;
	}
	.lead {
		margin-top: 8px;
		color: var(--ink-2);
	}
	/* The tray's picture, in the line that names it. */
	.flame {
		display: inline-flex;
		vertical-align: -2px;
	}
	.check {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 12px;
		color: var(--ink);
		cursor: pointer;
	}
	.check input {
		margin-top: 4px;
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
	}
	.actions {
		margin-top: 12px;
	}
	.go {
		margin-top: 28px;
	}
</style>
