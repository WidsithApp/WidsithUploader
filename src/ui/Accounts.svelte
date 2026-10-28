<script lang="ts">
	// The accounts on this computer, above the characters, only when there is more than one thing
	// to choose between: each linked account by its BattleTag, and every account nobody has linked
	// as one entry, "Another account" or "3 other accounts", since nobody knows their account
	// number. A dot on an entry not being looked at says something there is new or was sent.

	import type { AccountView } from '../core/engine.ts';

	let {
		accounts,
		current,
		onpick
	}: {
		accounts: AccountView[];
		/** The linked account being looked at, by ID, or `others` for the unlinked ones. */
		current: string | 'others';
		onpick: (id: string | 'others') => void;
	} = $props();

	const linked = $derived(accounts.filter((a) => a.linked && a.id !== null));
	const others = $derived(accounts.filter((a) => !a.linked));
	const othersLabel = $derived(
		others.length === 1 ? 'Another account' : `${others.length} other accounts`
	);
	const othersNew = $derived(others.some((a) => a.isNew));
</script>

{#if linked.length + (others.length ? 1 : 0) > 1}
	<div class="accounts" role="tablist" aria-label="Accounts on this computer">
		{#each linked as account (account.id)}
			<button
				type="button"
				role="tab"
				class="account"
				class:current={current === account.id}
				aria-selected={current === account.id}
				onclick={() => onpick(account.id ?? 'others')}
			>
				{#if current !== account.id && (account.isNew || account.sentSinceLooked)}
					<span class="dot" aria-label="Something new"></span>
				{/if}
				{account.battletag ?? 'Linked'}
			</button>
		{/each}
		{#if others.length}
			<button
				type="button"
				role="tab"
				class="account other"
				class:current={current === 'others'}
				aria-selected={current === 'others'}
				title="Found under {others.length === 1 ? 'an account folder' : 'account folders'} that {others.length === 1 ? 'isn’t' : 'aren’t'} linked"
				onclick={() => onpick('others')}
			>
				{#if current !== 'others' && othersNew}
					<span class="dot" aria-label="Something new"></span>
				{/if}
				{othersLabel}
			</button>
		{/if}
	</div>
{/if}

<style>
	.accounts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 18px;
	}
	.account {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 5px 12px;
		border: 1px solid var(--rule-2);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink-2);
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--t-fast) var(--ease-out),
			color var(--t-fast) var(--ease-out),
			border-color var(--t-fast) var(--ease-out);
	}
	.account:hover,
	.account:focus-visible {
		border-color: var(--accent);
		color: var(--ink);
	}
	.account.current {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--paper);
	}
	.account.other:not(.current) {
		color: var(--muted);
		border-style: dashed;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--seal);
	}
</style>
