<script lang="ts">
	// Everything about the app rather than the characters, in four tabs of cards (Section.svelte,
	// the form the site's account settings use): what is sent and when the app runs, where the
	// game is, this computer's link to the site, and what the app is.

	import { version } from '../../package.json';
	import { APP_NAME, SITE_NAME } from '../core/config.ts';
	import type { View } from '../core/engine.ts';
	import { flavorName, isOlder } from '../core/version.ts';
	import type { Controller, Shell } from './controller.ts';
	import Icon from './Icon.svelte';
	import Section from './Section.svelte';
	import Switch from './Switch.svelte';
	import { ago } from './words.ts';

	let {
		view,
		controller,
		shell,
		folderNote,
		onaddfolder
	}: {
		view: View;
		controller: Controller;
		shell: Shell;
		/** Said under the folders when the folder picked isn't one. */
		folderNote: string | null;
		onaddfolder: () => void;
	} = $props();

	type Tab = 'sending' | 'folders' | 'computer' | 'about';
	const TABS: { id: Tab; label: string }[] = [
		{ id: 'sending', label: 'Sending' },
		{ id: 'folders', label: 'Game folders' },
		{ id: 'computer', label: 'This computer' },
		{ id: 'about', label: 'About' }
	];
	let tab = $state<Tab>('sending');

	/** The arrow keys move between the tabs, as they do in any row of tabs. */
	function step(event: KeyboardEvent) {
		const at = TABS.findIndex((t) => t.id === tab);
		let next = at;
		if (event.key === 'ArrowRight') next = (at + 1) % TABS.length;
		else if (event.key === 'ArrowLeft') next = (at - 1 + TABS.length) % TABS.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = TABS.length - 1;
		else return;
		event.preventDefault();
		tab = TABS[next].id;
		document.getElementById(`tab-${tab}`)?.focus();
	}

	const host = $derived(new URL(shell.server).host);
	const addonPage = $derived(`${shell.server}/#get`);

	/**
	 * The folders the player added by hand, which are the only ones that can be removed: the ones
	 * found through Battle.net would only be found again. The engine lists them as `manualRoots`.
	 */
	const added = $derived(new Set(view.manualRoots));

	let startsWithWindows = $state<boolean | null>(null);
	$effect(() => {
		void shell.startsWithWindows().then((on) => (startsWithWindows = on));
	});
	async function setStart(on: boolean) {
		startsWithWindows = on;
		try {
			await shell.setStartsWithWindows(on);
		} catch {
			startsWithWindows = !on;
		}
	}

	/** The link being unlinked, by account ID: asked about, then under way. */
	let confirmingUnlink = $state<string | null>(null);
	let unlinking = $state<string | null>(null);
	async function unlink(id: string) {
		confirmingUnlink = null;
		unlinking = id;
		await controller.unlink(id);
		unlinking = null;
	}
	/** Linking another account, until the site has answered with a code. */
	let linkingMore = $state(false);
	async function linkMore() {
		linkingMore = true;
		try {
			await controller.link(true);
		} finally {
			linkingMore = false;
		}
	}

	/** "0.2.8 in Retail and 0.2.9 in Classic Era": the installs asked for, each named once. */
	function installs(only: 'outdated' | 'all'): string {
		const latest = view.addon.latest;
		const said = new Set<string>();
		for (const addon of view.addon.installed) {
			if (addon.version === null) continue;
			if (only === 'outdated' && (latest === null || !isOlder(addon.version, latest))) continue;
			said.add(`${addon.version} in ${flavorName(addon.flavor)}`);
		}
		const list = [...said];
		if (list.length <= 1) return list[0] ?? '';
		return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
	}

	/** The addon's card in one sentence. */
	const addonLine = $derived.by(() => {
		switch (view.addon.state) {
			case 'missing':
				return `The ${SITE_NAME} addon isn’t installed in any of the game folders.`;
			case 'outdated':
				return `Version ${view.addon.latest} is out, and you have ${installs('outdated')}.`;
			case 'current':
				return `The addon is up to date: ${installs('all')}.`;
			default:
				return `You have ${installs('all')}.`;
		}
	});

	/** When play was last sent under a link, as the card says it. */
	const lastSent = (at: number | null, hasRecordings: boolean) =>
		!hasRecordings
			? 'No recordings on this computer.'
			: at !== null
				? `Play was last sent ${ago(at)}.`
				: 'Nothing has been sent yet.';

	/** The app's own version, and whether a newer one is on its way. */
	const versionLine = $derived.by(() => {
		const update = view.update;
		if (!update) return 'Up to date.';
		switch (update.state) {
			case 'downloading':
				return `Version ${update.version} is on its way.`;
			case 'ready':
				return `Version ${update.version} is ready. It goes in when you restart the app, or by itself while you aren’t using it.`;
			case 'installing':
				return 'Updating.';
			default:
				return update.message ?? 'The update couldn’t be downloaded. It will be tried again.';
		}
	});
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="tabs" role="tablist" aria-label="Settings" tabindex="-1" onkeydown={step}>
	{#each TABS as item (item.id)}
		<button
			type="button"
			role="tab"
			id="tab-{item.id}"
			class="tab"
			class:current={tab === item.id}
			aria-selected={tab === item.id}
			aria-controls="panel-{item.id}"
			tabindex={tab === item.id ? 0 : -1}
			onclick={() => (tab = item.id)}>{item.label}</button
		>
	{/each}
</div>

<div class="panel" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}">
	{#if tab === 'sending'}
		<Section
			title="Characters"
			line="Each one is kept Private on {SITE_NAME}, and made Public from its page there."
		>
			<p>
				To keep a character on this PC only, switch off Uploading on its card. One you removed on
				{SITE_NAME} stays off until you switch it back on.
			</p>
		</Section>
		<Section
			title="When it runs"
			line="The app sits in the tray and looks for new play every few seconds."
		>
			<label class="row">
				<span>
					Start when I sign in to Windows
					<span class="note">So nothing waits to be sent.</span>
				</span>
				<Switch
					on={startsWithWindows === true}
					label="Start when I sign in to Windows"
					disabled={startsWithWindows === null}
					onturn={setStart}
				/>
			</label>
			<label class="row">
				<span>
					Uploading
					<span class="note"
						>Off pauses it: nothing is sent until it is on again, here or from the tray.</span
					>
				</span>
				<Switch on={!view.paused} label="Uploading" onturn={(on) => controller.setPaused(!on)} />
			</label>
			<p class="actions">
				<button type="button" class="btn" onclick={() => controller.sendNow()}
					>Look for new play now</button
				>
			</p>
		</Section>
	{:else if tab === 'folders'}
		<Section
			title="Game folders"
			line="The recordings are read from these: the game found through Battle.net, and any folder you add."
		>
			<ul class="folders">
				{#each view.roots as root (root)}
					<li class="row folder">
						<span class="path">{root}</span>
						{#if added.has(root)}
							<button type="button" class="link quiet" onclick={() => controller.removeRoot(root)}
								>Remove</button
							>
						{/if}
					</li>
				{:else}
					<li class="note">No game folder has been found on this computer.</li>
				{/each}
			</ul>
			<p class="actions">
				<button type="button" class="btn" onclick={onaddfolder}>Add a game folder…</button>
			</p>
			{#if folderNote}
				<p class="trouble" role="status">{folderNote}</p>
			{/if}
		</Section>
	{:else if tab === 'computer'}
		{#if !view.linked}
			<Section
				title="The link"
				line="This computer isn’t linked to {SITE_NAME} yet, so nothing is sent from it."
			>
				<p>Linking is offered under Characters.</p>
			</Section>
		{:else if view.links.length > 1}
			<Section
				title="The links"
				line="Linked to {SITE_NAME} for {view.links.length} accounts, each sending only its own recordings."
			>
				{#each view.links as link (link.id)}
					{#if unlinking === link.id}
						<p role="status">Unlinking {link.battletag ?? 'the account'}.</p>
					{:else if confirmingUnlink === link.id}
						<p class="actions">
							<b>Unlink {link.battletag ?? 'this account'}?</b>
							<button type="button" class="btn" onclick={() => unlink(link.id)}>Unlink</button>
							<button type="button" class="link quiet" onclick={() => (confirmingUnlink = null)}
								>Keep it linked</button
							>
						</p>
					{:else}
						<p class="row">
							<span>
								<b>{link.battletag ?? 'An account'}</b>
								<span class="note">{lastSent(link.lastSentAt, link.hasRecordings)}</span>
							</span>
							<button type="button" class="link quiet" onclick={() => (confirmingUnlink = link.id)}
								>Unlink…</button
							>
						</p>
					{/if}
				{/each}
				<p class="note">
					What you keep on {SITE_NAME} stays there when an account is unlinked, and nothing more is
					sent for it until it is linked again.
				</p>
				<p class="actions">
					<button type="button" class="btn" disabled={linkingMore} onclick={linkMore}
						>{linkingMore ? 'Opening…' : 'Link another account'} <Icon name="out" size={13} /></button
					>
				</p>
			</Section>
		{:else}
			{@const link = view.links[0]}
			<Section title="The link" line="Linked to {SITE_NAME} as {link.battletag ?? 'your account'}.">
				<p>{lastSent(link.lastSentAt, link.hasRecordings)}</p>
				<p class="note">
					Unlinked, what you keep on {SITE_NAME} stays there, and nothing more is sent from here
					until it is linked again. Another Battle.net account that plays on this computer is
					linked on its own: sign in on {SITE_NAME} as it when the page opens.
				</p>
				{#if unlinking === link.id}
					<p role="status">Unlinking.</p>
				{:else if confirmingUnlink === link.id}
					<p class="actions">
						<b>Unlink this computer?</b>
						<button type="button" class="btn" onclick={() => unlink(link.id)}>Unlink</button>
						<button type="button" class="link quiet" onclick={() => (confirmingUnlink = null)}
							>Keep it linked</button
						>
					</p>
				{:else}
					<p class="actions">
						<button type="button" class="btn" onclick={() => (confirmingUnlink = link.id)}
							>Unlink this computer…</button
						>
						<button type="button" class="btn" disabled={linkingMore} onclick={linkMore}
							>{linkingMore ? 'Opening…' : 'Link another account'} <Icon name="out" size={13} /></button
						>
					</p>
				{/if}
			</Section>
		{/if}

		{#if view.addon.state === 'missing' || view.addon.state === 'outdated'}
			<Section title="The addon" line={addonLine}>
				<p class="actions">
					<button type="button" class="btn-alt" onclick={() => shell.open(addonPage)}
						>{view.addon.state === 'missing' ? 'Get the addon' : 'Get the update'}
						<Icon name="out" size={13} /></button
					>
				</p>
			</Section>
		{:else}
			<Section title="The addon" line={addonLine} />
		{/if}

		<Section
			title="The tray"
			line="Windows may tuck the app’s icon behind the arrow beside the clock."
		>
			<p class="actions">
				<button type="button" class="btn" onclick={() => shell.openTaskbarSettings()}
					>Open taskbar settings <Icon name="out" size={13} /></button
				>
			</p>
		</Section>
	{:else}
		<Section title="{APP_NAME} {version}" line={versionLine}>
			<p>
				It sends only to {host}, and keeps its link to your account in Windows Credential Manager.
			</p>
			<p class="note">
				A newer version is looked for every six hours, and goes in when you ask or by itself once
				the app has been left alone for a while.
			</p>
			<p class="actions">
				<button type="button" class="btn-alt" onclick={() => shell.open(shell.server)}
					>Open {SITE_NAME} <Icon name="out" size={13} /></button
				>
				<button
					type="button"
					class="btn"
					onclick={() => shell.open('https://github.com/WidsithApp/WidsithUploader')}
					>Source <Icon name="out" size={13} /></button
				>
			</p>
		</Section>
		<Section title="What it reads" line="Only these, and it never writes into the game’s folders.">
			<ul class="marked">
				<li>
					<Icon name="file" size={18} />
					<span>The recordings the addon writes, and the addon’s version.</span>
				</li>
				<li>
					<Icon name="folder" size={18} />
					<span>Battle.net’s list of where the game is installed.</span>
				</li>
				<li>
					<Icon name="camera" size={18} />
					<span>The names of the addon’s screenshots, never the pictures.</span>
				</li>
			</ul>
		</Section>
		<Section
			title="The terms"
			line="Using it is covered by the Terms of Service and the Privacy page on {host}."
		>
			<p class="note">The licence is in LICENSE.txt beside the app.</p>
			<p class="actions">
				<button type="button" class="btn" onclick={() => shell.open(`${shell.server}/terms`)}
					>Terms of Service <Icon name="out" size={13} /></button
				>
				<button type="button" class="btn" onclick={() => shell.open(`${shell.server}/privacy`)}
					>Privacy <Icon name="out" size={13} /></button
				>
			</p>
		</Section>
	{/if}
</div>

<style>
	.tabs {
		display: flex;
		gap: 2px;
		margin: -4px 0 0;
		border-bottom: 1px solid var(--rule);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab {
		position: relative;
		padding: 8px 10px 9px;
		color: var(--ink-2);
		font-size: 14.5px;
		font-weight: 500;
		white-space: nowrap;
		transition: color var(--t-fast) var(--ease-out);
	}
	.tab::after {
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
	.tab:hover,
	.tab:focus-visible {
		color: var(--ink);
	}
	.tab:hover::after,
	.tab:focus-visible::after {
		clip-path: inset(0 0 0 0);
	}
	.tab.current {
		color: var(--ink);
	}
	.tab.current::after {
		background: var(--seal);
		clip-path: inset(0 0 0 0);
		transition: none;
	}
	.panel {
		padding-top: 18px;
	}
	/* A switch row is a label, so its words turn the switch too. */
	label.row {
		cursor: pointer;
	}
	/* The folders, one a row, ruled apart. */
	.folders {
		display: grid;
	}
	.folder {
		padding: 8px 0;
		border-top: 1px solid var(--rule);
	}
	.folder:first-child {
		padding-top: 0;
		border-top: 0;
	}
	.path {
		overflow-wrap: anywhere;
		user-select: text;
	}
</style>
