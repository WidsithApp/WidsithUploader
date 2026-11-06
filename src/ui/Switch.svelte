<script lang="ts">
	// The window's switch: a live state that takes effect as soon as it is turned (a character's
	// Uploading on its card and on the start screen, Uploading and Start with Windows in Settings).
	// A choice submitted with a button, as the greeting's is, stays a checkbox.

	let {
		on,
		label,
		disabled = false,
		onturn
	}: {
		on: boolean;
		/** What it switches, for the screen reader; the visible words are the caller's. */
		label: string;
		disabled?: boolean;
		onturn: (on: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	class="switch"
	role="switch"
	aria-checked={on}
	aria-label={label}
	{disabled}
	onclick={() => onturn(!on)}><span></span></button
>

<style>
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
	.switch:disabled {
		opacity: 0.6;
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
</style>
