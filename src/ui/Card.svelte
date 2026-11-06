<script lang="ts">
	// One character's card: name, class and level, the site's figures, a status line and the
	// Uploading switch, which is the card's only control. Sharing and Battle.net verification are
	// changed on the site, so the card only links there. Characters not being uploaded are faded.

	import { SITE_NAME } from '../core/config.ts';
	import type { CharacterView } from '../core/engine.ts';
	import { flavorName } from '../core/version.ts';
	import { onRealm, realmLabel } from '../shared/realm.ts';
	import { CLASSES } from './classes.ts';
	import Face from './Face.svelte';
	import Icon from './Icon.svelte';
	import OpenInBrowser from './OpenInBrowser.svelte';
	import Switch from './Switch.svelte';
	import { ago, played } from './words.ts';

	let {
		character,
		showFlavor = false,
		paused = false,
		accountUrl,
		browser,
		onswitch,
		onopen,
		oncopy,
		onpictures
	}: {
		character: CharacterView;
		/** Show the game folder, for a name found in two folders. */
		showFlavor?: boolean;
		paused?: boolean;
		/** The site's account page, where Battle.net verification happens. */
		accountUrl: string;
		/** The default browser's name, which View names; null when the computer can't say. */
		browser: string | null;
		onswitch: (on: boolean) => Promise<void>;
		onopen: (url: string) => void;
		/** Puts the page's address on the clipboard; false if the system wouldn't allow it. */
		oncopy: (text: string) => Promise<boolean>;
		/** Opens the Screenshots folder of a game folder in Explorer. */
		onpictures: (gameFolder: string) => void;
	} = $props();

	const known = $derived(character.classID === null ? null : (CLASSES[character.classID] ?? null));
	const color = $derived(known?.color ?? null);

	/** "Level 12 Night Elf Druid · Steamwheedle Cartel", from whatever is known. */
	const description = $derived.by(() => {
		const who = [
			character.level !== null ? `Level ${character.level}` : null,
			character.race,
			known?.name ?? null
		]
			.filter(Boolean)
			.join(' ');
		return [who, realmLabel(character.realm), showFlavor ? flavorName(character.flavor) : null]
			.filter(Boolean)
			.join(' · ');
	});

	/** On the site. A character mid-send counts once it has a sharing setting. */
	const kept = $derived(
		character.status === 'kept' || (character.status === 'sending' && character.sharing !== null)
	);
	const out = $derived(
		character.status === 'skipped' ||
			character.status === 'removed' ||
			character.status === 'refused'
	);
	/** The switch's position; null means no switch. */
	const uploading = $derived.by((): boolean | null => {
		switch (character.status) {
			case 'kept':
			case 'sending':
			case 'new':
			case 'refused':
				return true;
			case 'skipped':
			case 'removed':
				return false;
			default:
				return null;
		}
	});

	/** Battle.net never lists WoW Forever characters, so only Retail and Classic can be unverified. */
	const unverified = $derived(
		kept &&
			character.verified === false &&
			(character.game === 'retail' || character.game === 'classic')
	);

	// Session counts are left out on purpose: players think in /played, not sessions.
	const facts = $derived.by(() => {
		const list: { label: string; value: string }[] = [];
		if (character.gamePlayedMs !== null) {
			list.push({ label: 'Played', value: played(character.gamePlayedMs) });
		}
		if (character.playedMs !== null) {
			list.push({ label: 'Recorded', value: played(character.playedMs) });
		}
		if (character.lastPlayedMs !== null) {
			list.push({ label: 'Last played', value: ago(character.lastPlayedMs) });
		}
		return list;
	});

	/** The sharing mark's explanation is open, until a click anywhere else or Escape. */
	let explaining = $state(false);
	$effect(() => {
		if (!explaining) return;
		const close = () => (explaining = false);
		const key = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		document.addEventListener('click', close);
		document.addEventListener('keydown', key);
		return () => {
			document.removeEventListener('click', close);
			document.removeEventListener('keydown', key);
		};
	});

	let busy = $state(false);
	async function turn(on: boolean) {
		busy = true;
		try {
			await onswitch(on);
		} finally {
			busy = false;
		}
	}
</script>

<li class="sheet card" class:out aria-label={character.name}>
	<div class="top">
		<div class="who-face">
			<Face
				name={character.name}
				classID={character.classID}
				classIcon={character.classIcon}
				level={character.level}
			/>
		</div>

		<div class="who">
			<h3 class="display name" class:known={color !== null} style:--class={color}>
				{#if character.sentSinceLooked || (character.isNew && !out)}
					<span
						class="dot"
						title={character.sentSinceLooked ? 'Sent since you last looked' : 'New on this computer'}
					></span>
				{/if}
				{character.name}
			</h3>
			{#if description}
				<p class="describe">{description}</p>
			{/if}
			{#if character.earlier}
				<p class="older">From an older file</p>
			{/if}
			{#if character.former}
				<p class="older">
					{['An earlier ' + character.name, onRealm(character.realm)].filter(Boolean).join(' ')}. It
					isn’t in the game any more; a newer character took its name.
				</p>
			{/if}
		</div>

		{#if kept && character.sharing !== null}
			<!-- Who sees it is the site's choice, so the mark only says which, and where it is chosen. -->
			<div class="sharing">
				<button
					type="button"
					class="pill"
					class:public={character.sharing === 'public'}
					aria-expanded={explaining}
					onclick={(event) => {
						event.stopPropagation();
						explaining = !explaining;
					}}
				>
					{#if character.sharing === 'public'}
						<Icon name="globe" size={13} />Public
					{:else}
						<Icon name="lock" size={13} />Private
					{/if}
				</button>
				{#if explaining}
					<p class="tip sheet" role="status">Who sees it is chosen on its page on {SITE_NAME}.</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if facts.length && !out}
		<div class="facts">
			{#each facts as fact (fact.label)}
				<p class="fact">
					<span class="caption">{fact.label}</span>
					<span class="value figures">{fact.value}</span>
				</p>
			{/each}
		</div>
	{/if}

	<div class="state" role="status">
		{#if character.status === 'reading'}
			<p>Reading the recording.</p>
		{:else if character.status === 'unreadable'}
			<p class="trouble"><Icon name="warning" size={15} /><span>{character.message}</span></p>
			<p class="under">It will be read again the next time the game saves it.</p>
		{:else if character.status === 'waiting'}
			<p>Waiting for {SITE_NAME} to answer.</p>
		{:else if character.status === 'unstarted'}
			<p><Icon name="unsent" size={15} /><span>Sent once you start uploading.</span></p>
		{:else if character.status === 'new'}
			{#if character.message}
				<p class="trouble"><Icon name="warning" size={15} /><span>{character.message}</span></p>
			{:else if paused}
				<p>
					<Icon name="pause" size={13} /><span
						>Goes to {SITE_NAME} as Private once uploading resumes.</span
					>
				</p>
			{:else}
				<p><Icon name="unsent" size={15} /><span>On its way to {SITE_NAME}, as Private.</span></p>
			{/if}
		{:else if character.status === 'sending'}
			<p><Icon name="unsent" size={15} /><span>Sending new play to {SITE_NAME}.</span></p>
			<div class="bar" aria-hidden="true">
				<span
					style:width="{character.progress && character.progress.total > 0
						? (100 * character.progress.sent) / character.progress.total
						: 4}%"
				></span>
			</div>
		{:else if character.status === 'kept'}
			{#if character.message}
				<p class:trouble={!character.upToDate}>
					<Icon name={character.upToDate ? 'check' : 'warning'} size={15} /><span
						>{character.message}</span
					>
				</p>
			{:else if character.upToDate}
				<p class="good">
					<Icon name="check" size={14} />
					<span>
						Up to date on {SITE_NAME}{#if character.sentAt !== null}<span class="when"
								>{ago(character.sentAt)}</span
							>{/if}
					</span>
				</p>
			{:else if paused}
				<p><Icon name="pause" size={13} /><span>New play, waiting until uploading resumes.</span></p>
			{:else}
				<p><Icon name="unsent" size={15} /><span>New play, waiting to be sent.</span></p>
			{/if}
		{:else if character.status === 'skipped' && character.former}
			<p>
				<Icon name="laptop" size={15} /><span
					>Its recording stays on this PC. Switch on to keep it on {SITE_NAME} as its own character.</span
				>
			</p>
		{:else if character.status === 'skipped' && character.sharing !== null}
			<!-- The site keeps it: what was sent stays, and only the play since is on this PC alone. -->
			<p>
				<Icon name="laptop" size={15} /><span
					>Switched off. What was sent stays on {SITE_NAME}; play since then stays on this PC
					until it is switched back on.</span
				>
			</p>
		{:else if character.status === 'skipped'}
			<p>
				<Icon name="laptop" size={15} /><span
					>Only on this PC. Nothing of it is sent, so if the game folder is reset or you change
					computers, its recording is lost.</span
				>
			</p>
		{:else if character.status === 'removed'}
			<p>
				<Icon name="laptop" size={15} /><span
					>You removed it from {SITE_NAME}{character.removedAt !== null
						? ` ${ago(character.removedAt)}`
						: ''}, so its play stays on this PC. Switch it back on to send all of it again.</span
				>
			</p>
		{:else if character.status === 'refused'}
			<p class="trouble">
				<Icon name="warning" size={15} /><span
					>{character.message ?? `${SITE_NAME} turned it away.`}</span
				>
			</p>
		{/if}
		{#if unverified}
			<p class="aside">
				<span>Not yet verified on Battle.net</span>
				<button type="button" class="link" onclick={() => onopen(accountUrl)}
					>Verify on {SITE_NAME} <Icon name="out" size={12} /></button
				>
			</p>
		{/if}
		<!-- The pictures are on this PC whether or not the character is sent, so always said. -->
		{#if character.pictures > 0 && character.gameFolder}
			{@const folder = character.gameFolder}
			<p class="aside">
				<span
					>{character.pictures === 1 ? '1 picture' : `${character.pictures} pictures`} on this PC</span
				>
				<button type="button" class="link" onclick={() => onpictures(folder)}
					>Open the folder <Icon name="out" size={12} /></button
				>
			</p>
		{/if}
	</div>

	{#if uploading !== null}
		<div class="foot">
			{#if kept && character.pageUrl}
				<!-- Its page shows a Private character only to its player signed in, so the browser is named. -->
				<OpenInBrowser words="View" url={character.pageUrl} {browser} {onopen} {oncopy} />
			{/if}
			<label class="uploading">
				<span>Uploading</span>
				<Switch on={uploading} label="Uploading {character.name}" disabled={busy} onturn={turn} />
			</label>
		</div>
	{/if}
</li>

<style>
	.card {
		padding: 14px;
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	/* Faded when not being uploaded; the status line says why. */
	.out .who-face,
	.out .who {
		opacity: 0.55;
		filter: saturate(0.4);
	}

	.who {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 18px;
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.name.known {
		color: color-mix(in oklab, var(--class) var(--class-share), var(--ink));
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--gold);
	}
	.describe {
		margin-top: 1px;
		color: var(--ink-2);
		font-size: 14px;
	}
	.older {
		margin-top: 2px;
		color: var(--muted);
		font-size: 12.5px;
	}

	/* Private/Public mark. A click opens one line saying where it is chosen, under the mark. */
	.sharing {
		position: relative;
		flex: none;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 2px 9px 2px 8px;
		border: 1px solid var(--rule-2);
		border-radius: 999px;
		color: var(--ink-2);
		font-size: 13px;
		font-weight: 600;
		transition: border-color var(--t-fast) var(--ease-out);
	}
	.pill.public {
		border-color: color-mix(in oklab, var(--good) 45%, transparent);
		background: color-mix(in oklab, var(--good) 12%, transparent);
		color: color-mix(in oklab, var(--good) 70%, var(--ink));
	}
	.pill:hover,
	.pill:focus-visible,
	.pill[aria-expanded='true'] {
		border-color: var(--accent);
	}
	.tip {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 1;
		width: max-content;
		max-width: 260px;
		padding: 8px 11px;
		color: var(--ink-2);
		font-size: 13.5px;
		line-height: 1.4;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 22px;
		margin-top: 12px;
		padding-left: 60px;
	}
	.fact {
		display: grid;
	}
	.value {
		color: var(--ink);
		font-size: 14.5px;
		font-weight: 500;
	}

	/* Status line: icon, then text. */
	.state {
		margin-top: 10px;
		padding-left: 60px;
		color: var(--ink-2);
		font-size: 14.5px;
	}
	.state:empty {
		display: none;
	}
	.state p {
		display: flex;
		align-items: flex-start;
		gap: 7px;
	}
	.state p :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--muted);
	}
	.state .under {
		margin-top: 2px;
		padding-left: 22px;
	}
	.state .good,
	.state .good :global(svg) {
		color: var(--good);
	}
	.state .trouble,
	.state .trouble :global(svg) {
		color: var(--seal);
	}
	.state .when {
		color: var(--muted);
	}
	.state .when::before {
		content: ' · ';
		white-space: pre;
	}
	/* Quieter lines under the status, indented to the status text rather than its icon: whether
	   Battle.net lists the character, and the addon's pictures of it on this PC. */
	.state .aside {
		flex-wrap: wrap;
		gap: 2px 12px;
		margin-top: 4px;
		padding-left: 22px;
		color: var(--muted);
		font-size: 13.5px;
	}
	/* With no status line above (an account not linked yet), it stands at the start. */
	.state .aside:first-child {
		margin-top: 0;
		padding-left: 0;
	}
	.state .aside .link {
		font-size: 13.5px;
	}
	.state .aside .link :global(svg) {
		margin-top: 0;
		color: inherit;
	}
	.bar {
		height: 4px;
		margin: 8px 0 0 22px;
		border-radius: 2px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: 2px;
		background: var(--accent);
		transition: width var(--t-base) var(--ease-out);
	}

	/* Footer: View in the browser with its copy link under it, and the switch on the right. */
	.foot {
		display: flex;
		align-items: center;
		gap: 8px 12px;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--rule);
	}
	.foot :global(.open) {
		display: grid;
		justify-items: start;
		gap: 5px;
	}
	.foot :global(.btn-main) {
		padding: 7px 13px;
		font-size: 14px;
	}
	.foot :global(.link) {
		margin-left: 2px;
		font-size: 13px;
	}

	.uploading {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		margin-left: auto;
		color: var(--ink-2);
		font-size: 14px;
		cursor: pointer;
	}
</style>
