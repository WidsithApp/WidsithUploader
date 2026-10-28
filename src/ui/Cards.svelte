<script lang="ts">
	// The character list: a tab per game (just a heading when there's only one), most recently
	// played first, earlier characters in their own section at the bottom. With no characters it
	// explains why and what to do.

	import { untrack } from 'svelte';
	import { SITE_NAME } from '../core/config.ts';
	import type { CharacterView, View } from '../core/engine.ts';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import type { Controller, Shell } from './controller.ts';

	let {
		view,
		characters: only,
		controller,
		shell,
		onaddfolder
	}: {
		view: View;
		/** One account's characters; defaults to all of them. */
		characters?: CharacterView[];
		controller: Controller;
		shell: Shell;
		onaddfolder: () => void;
	} = $props();

	const characters = $derived(only ?? view.characters);
	const addonPage = $derived(`${shell.server}/#get`);

	/** Name+realm counts, so a name found in two game folders can show which folder each is in. */
	const twice = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const c of characters) {
			// An earlier character always shares its name with the newer one, in the same folder.
			if (c.former) continue;
			const key = `${c.name}|${c.realm}`;
			seen.set(key, (seen.get(key) ?? 0) + 1);
		}
		return seen;
	});

	const byName = (a: CharacterView, b: CharacterView) =>
		a.name.localeCompare(b.name) || (a.realm ?? '').localeCompare(b.realm ?? '');
	/** The site's last-played time if it has one, else the file's write time. */
	const lastPlay = (c: CharacterView) => c.lastPlayedMs ?? c.savedAt;
	const byPlay = (a: CharacterView, b: CharacterView) =>
		lastPlay(b) - lastPlay(a) || byName(a, b);

	// The order is fixed each time the window is shown and held while it's open, so a card doesn't
	// jump under the pointer when its switch is turned or new play arrives. It covers every
	// account's characters, so switching accounts keeps the order too.
	let held = $state<string[]>([]);
	const settle = () => (held = [...view.characters].sort(byPlay).map((c) => c.key));
	$effect(() => {
		untrack(settle);
		const shown = () => {
			if (document.visibilityState === 'visible') untrack(settle);
		};
		document.addEventListener('visibilitychange', shown);
		return () => document.removeEventListener('visibilitychange', shown);
	});
	// Characters found while the window is open go to the top and stay there.
	$effect(() => {
		const all = view.characters;
		untrack(() => {
			const known = new Set(held);
			const found = all.filter((c) => !known.has(c.key)).sort(byPlay);
			if (found.length) held = [...found.map((c) => c.key), ...held];
		});
	});
	const place = $derived(new Map(held.map((key, index) => [key, index])));
	const inPlace = (a: CharacterView, b: CharacterView) =>
		(place.get(a.key) ?? -1) - (place.get(b.key) ?? -1) || byPlay(a, b);

	/** No sessions yet (e.g. logged in once with the addon). Tucked away unless the site keeps it. */
	const isEmpty = (c: CharacterView) =>
		c.sessions === 0 && c.status !== 'kept' && c.status !== 'sending' && c.status !== 'unreadable';
	const empty = $derived(characters.filter(isEmpty).sort(byName));

	/** Tab order: Forever (the main target) first, an unknown game last. */
	const ORDER = ['forever', 'retail', 'classic'];
	const groups = $derived.by(() => {
		const rest = characters.filter((c) => !isEmpty(c));
		const byLabel = new Map<string, { rank: number; characters: CharacterView[] }>();
		for (const c of rest) {
			const rank = c.game === null ? ORDER.length : ORDER.indexOf(c.game);
			const group = byLabel.get(c.gameLabel) ?? { rank, characters: [] };
			group.rank = Math.min(group.rank, rank);
			group.characters.push(c);
			byLabel.set(c.gameLabel, group);
		}
		return [...byLabel]
			.map(([label, group]) => {
				const all = group.characters.sort(inPlace);
				return {
					label,
					rank: group.rank,
					count: all.length,
					characters: all.filter((c) => !c.former),
					former: all.filter((c) => c.former)
				};
			})
			.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
	});

	/** Falls back to the first tab when nothing is picked or the picked game has gone. */
	let picked = $state<string | null>(null);
	const current = $derived(groups.find((g) => g.label === picked) ?? groups[0] ?? null);
</script>

{#snippet card(character: CharacterView)}
	<Card
		{character}
		showFlavor={(twice.get(`${character.name}|${character.realm}`) ?? 0) > 1}
		paused={view.paused}
		accountUrl="{shell.server}/account"
		onswitch={(on) => controller.setUploading(character.key, on)}
		onopen={shell.open}
	/>
{/snippet}

{#if view.linked && !view.online}
	<p class="offline" role="status">
		{SITE_NAME} can’t be reached just now. Your recordings are safe on this computer, and will be sent
		when it answers.
	</p>
{/if}

{#if characters.length}
	{#if !current && empty.length}
		<section class="empty sheet">
			<h2 class="display">No play recorded yet</h2>
			<p>
				The addon has met {empty.length === 1 ? 'one character' : `${empty.length} characters`} on
				this computer but recorded no play for {empty.length === 1 ? 'it' : 'them'} yet. {empty.length === 1 ? 'It' : 'They'} will show here once there is something to send.
			</p>
		</section>
	{/if}
	{#if current}
		<section>
			{#if groups.length > 1}
				<div class="games" role="tablist" aria-label="Games">
					{#each groups as group (group.label)}
						<button
							type="button"
							role="tab"
							class="game"
							class:current={group.label === current.label}
							aria-selected={group.label === current.label}
							onclick={() => (picked = group.label)}
						>
							{group.label}<span class="count figures">{group.count}</span>
						</button>
					{/each}
				</div>
			{:else}
				<div class="head">
					<h2 class="display">{current.label}</h2>
					<p>{current.count} {current.count === 1 ? 'character' : 'characters'}</p>
				</div>
			{/if}
			{#if current.characters.length}
				<ul class="cards">
					{#each current.characters as character (character.key)}
						{@render card(character)}
					{/each}
				</ul>
			{/if}
			{#if current.former.length}
				<h3 class="caption former">Earlier characters</h3>
				<ul class="cards">
					{#each current.former as character (character.key)}
						{@render card(character)}
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
	{#if current && empty.length}
		<details class="quiet">
			<summary>No play recorded yet ({empty.length})</summary>
			<p class="note">
				The addon has met {empty.length === 1 ? 'this character' : 'these characters'} but recorded
				no play yet. {empty.length === 1 ? 'It' : 'They'} will join the list above once there is
				something to send.
			</p>
			<ul class="names">
				{#each empty as character (character.key)}
					<li>{character.name}{character.realm ? ` · ${character.realm}` : ''}</li>
				{/each}
			</ul>
		</details>
	{/if}
{:else if view.roots.length === 0}
	<section class="empty sheet">
		<h2 class="display">World of Warcraft wasn’t found</h2>
		<p>Show the uploader the folder the game is installed in, and it will look there.</p>
		<p class="actions">
			<button type="button" class="btn-main" onclick={onaddfolder}>Choose the game folder</button>
		</p>
	</section>
{:else if view.addon.state === 'missing'}
	<section class="empty sheet">
		<h2 class="display">The addon isn’t installed yet</h2>
		<p>The {SITE_NAME} addon is what makes the recordings this app sends.</p>
		<p class="actions">
			<button type="button" class="btn-main" onclick={() => shell.open(addonPage)}
				>Get the addon <Icon name="out" size={13} /></button
			>
		</p>
	</section>
{:else}
	<section class="empty sheet">
		<h2 class="display">No recordings yet</h2>
		<p>
			The addon writes one for each character when you log out or reload the game, and it will
			show here a few seconds later.
		</p>
	</section>
{/if}

<style>
	section + section {
		margin-top: 24px;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		margin-bottom: 10px;
	}
	h2 {
		font-size: 19px;
		font-weight: 600;
		line-height: 1.25;
	}
	.head p {
		flex-basis: 100%;
		color: var(--muted);
		font-size: 14px;
	}
	.cards {
		display: grid;
		gap: 10px;
	}
	.former {
		margin-bottom: 10px;
	}
	.cards + .former {
		margin-top: 24px;
	}
	.offline {
		margin-bottom: 18px;
		padding-left: 12px;
		border-left: 3px solid var(--gold);
		color: var(--ink-2);
	}
	details {
		margin-top: 24px;
	}
	summary {
		width: fit-content;
		color: var(--muted);
		font-size: 14.5px;
		font-weight: 500;
		cursor: pointer;
	}
	summary:hover {
		color: var(--ink);
	}
	.empty {
		padding: 18px 18px 20px;
	}
	.empty p {
		margin-top: 6px;
		color: var(--ink-2);
	}
	.empty .actions {
		margin-top: 16px;
	}
	/* Game tabs. Hover slides in an accent underline; the current tab's is solid seal red. */
	.games {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		margin-bottom: 14px;
		border-bottom: 1px solid var(--rule-2);
	}
	.game {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 10px 9px;
		color: var(--ink-2);
		font-weight: 500;
		transition: color var(--t-fast) var(--ease-out);
	}
	.game::after {
		content: '';
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: -1px;
		height: 2px;
		background: var(--accent);
		clip-path: inset(0 100% 0 0);
		transition: clip-path var(--t-fast) var(--ease-out);
	}
	.game:hover,
	.game:focus-visible,
	.game.current {
		color: var(--ink);
	}
	.game:hover::after,
	.game:focus-visible::after {
		clip-path: inset(0 0 0 0);
	}
	.game.current::after {
		background: var(--seal);
		clip-path: inset(0 0 0 0);
		transition: none;
	}
	.count {
		padding: 0 7px;
		border-radius: 999px;
		background: var(--paper-2);
		color: var(--muted);
		font-size: 12px;
		font-weight: 600;
		line-height: 18px;
	}
	.game.current .count {
		background: var(--accent-wash);
		color: var(--ink);
	}
	/* Collapsed list of characters with nothing recorded yet. */
	section + details.quiet {
		margin-top: 24px;
	}
	.note {
		margin-top: 8px;
		color: var(--muted);
		font-size: 14px;
	}
	.names {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		margin-top: 8px;
		color: var(--ink-2);
		font-size: 14px;
	}
</style>
