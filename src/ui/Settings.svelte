<script lang="ts">
	// Everything about the app rather than the characters, in four tabs: what is sent and when the
	// app runs, where the game is, this computer's link to the site, and what the app is.

	import { version } from '../../package.json';
	import { APP_NAME, SITE_NAME } from '../core/config.ts';
	import type { View } from '../core/engine.ts';
	import { flavorName, isOlder } from '../core/version.ts';
	import type { Controller, Shell } from './controller.ts';
	import Icon from './Icon.svelte';
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
		<h2 class="display">Characters</h2>
		<p class="lead">
			Every character of a linked account is kept Private on {SITE_NAME} as soon as it has play to
			send, including the ones you play for the first time later. You can make one Public from its
			page on {SITE_NAME}. To keep one on this PC only, switch off Uploading on its card. A character
			you remove on {SITE_NAME} isn’t sent again until you switch it back on.
		</p>

		<h2 class="display">When it runs</h2>
		<label class="check">
			<input
				type="checkbox"
				checked={startsWithWindows === true}
				disabled={startsWithWindows === null}
				onchange={(event) => setStart(event.currentTarget.checked)}
			/>
			<span>Start when I sign in to Windows, so nothing waits to be sent</span>
		</label>
		<label class="check">
			<input
				type="checkbox"
				checked={view.paused}
				onchange={(event) => controller.setPaused(event.currentTarget.checked)}
			/>
			<span>Pause uploading, so nothing is sent until I resume it. The tray menu does the same.</span>
		</label>
		<p class="lead">
			The uploader looks for new play every few seconds while it runs. You can ask it to look at
			once.
		</p>
		<p class="actions">
			<button type="button" class="btn" onclick={() => controller.sendNow()}
				>Look for new play now</button
			>
		</p>
	{:else if tab === 'folders'}
		<h2 class="display">Game folders</h2>
		<p class="lead">
			The uploader reads the recordings in these World of Warcraft folders. It finds the game
			through Battle.net by itself, and you can add a folder it missed.
		</p>
		<ul class="folders">
			{#each view.roots as root (root)}
				<li class="sheet folder">
					<span class="path">{root}</span>
					{#if added.has(root)}
						<button type="button" class="link quiet" onclick={() => controller.removeRoot(root)}
							>Remove</button
						>
					{/if}
				</li>
			{:else}
				<li class="none">No game folder has been found on this computer.</li>
			{/each}
		</ul>
		<p class="actions">
			<button type="button" class="btn" onclick={onaddfolder}>Add a game folder…</button>
		</p>
		{#if folderNote}
			<p class="trouble" role="status">{folderNote}</p>
		{/if}
	{:else if tab === 'computer'}
		<h2 class="display">This computer</h2>
		{#if view.links.length > 1}
			<p class="lead">
				It is linked to {SITE_NAME} for {view.links.length} accounts. Each sends only its own
				recordings, under its own link.
			</p>
			<ul class="links">
				{#each view.links as link (link.id)}
					<li>
						<b>{link.battletag ?? 'An account'}</b>
						<span class="when">
							{#if !link.hasRecordings}
								no recordings on this computer
							{:else if link.lastSentAt !== null}
								play last sent {ago(link.lastSentAt)}
							{:else}
								nothing sent yet
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{:else if view.linked}
			<p class="lead">
				It is linked to {SITE_NAME} as <b>{view.battletag ?? 'your account'}</b>.
				{view.lastSentAt !== null
					? `Play was last sent ${ago(view.lastSentAt)}.`
					: 'Nothing has been sent from it yet.'}
			</p>
		{:else}
			<p class="lead">
				It isn’t linked to {SITE_NAME} yet, so nothing is sent from it. Linking is offered under
				Characters.
			</p>
		{/if}

		<h3>The addon</h3>
		{#if view.addon.state === 'missing'}
			<p class="lead">The {SITE_NAME} addon isn’t installed in any of the game folders.</p>
			<p class="actions">
				<button type="button" class="btn-alt" onclick={() => shell.open(addonPage)}
					>Get the addon <Icon name="out" size={13} /></button
				>
			</p>
		{:else if view.addon.state === 'outdated'}
			<p class="lead">Version {view.addon.latest} is out, and you have {installs('outdated')}.</p>
			<p class="actions">
				<button type="button" class="btn-alt" onclick={() => shell.open(addonPage)}
					>Get the update <Icon name="out" size={13} /></button
				>
			</p>
		{:else if view.addon.state === 'current'}
			<p class="lead">The addon is up to date.</p>
		{:else}
			<p class="lead">You have {installs('all')}.</p>
		{/if}

		<h3>The tray</h3>
		<p class="lead">
			Windows may tuck the uploader’s icon behind the arrow beside the clock. You can keep it in
			view from the taskbar settings.
		</p>
		<p class="actions">
			<button type="button" class="btn" onclick={() => shell.openTaskbarSettings()}
				>Open taskbar settings <Icon name="out" size={13} /></button
			>
		</p>

		{#if view.linked}
			<h3>Another account</h3>
			<p class="lead">
				If someone else plays on this computer, or you have a second Battle.net account, each is
				linked on its own and sends only its own recordings. Sign in on {SITE_NAME} as that
				account when the page opens.
			</p>
			<p class="actions">
				<button type="button" class="btn" disabled={linkingMore} onclick={linkMore}
					>{linkingMore ? 'Opening…' : 'Link another account'} <Icon name="out" size={13} /></button
				>
			</p>
		{/if}

		{#if !view.linked}
			<!-- Nothing to unlink. -->
		{:else}
			<h3>Unlinking</h3>
			<p class="lead">
				You can unlink {view.links.length > 1 ? 'an account' : 'it'} here, or under Linked
				computers in your settings on {SITE_NAME}. What you keep on {SITE_NAME} stays there, and
				nothing more is sent from here until it is linked again.
			</p>
			{#each view.links as link (link.id)}
				{#if unlinking === link.id}
					<p class="lead" role="status">Unlinking {link.battletag ?? 'the account'}.</p>
				{:else if confirmingUnlink === link.id}
					<p class="actions">
						<span class="lead"><b>Unlink {link.battletag ?? 'this account'}?</b></span>
						<button type="button" class="btn" onclick={() => unlink(link.id)}>Unlink</button>
						<button type="button" class="link quiet" onclick={() => (confirmingUnlink = null)}
							>Keep it linked</button
						>
					</p>
				{:else}
					<p class="actions">
						<button type="button" class="btn" onclick={() => (confirmingUnlink = link.id)}
							>{view.links.length > 1
								? `Unlink ${link.battletag ?? 'this account'}…`
								: 'Unlink this computer…'}</button
						>
					</p>
				{/if}
			{/each}
		{/if}
	{:else}
		<h2 class="display">{APP_NAME} {version}</h2>
		{#if !view.update}
			<p class="lead">Up to date.</p>
		{:else if view.update.state === 'downloading'}
			<p class="lead">Version {view.update.version} is on its way.</p>
		{:else if view.update.state === 'ready'}
			<p class="lead">
				Version {view.update.version} is ready. It goes in when you restart the app, or by itself
				while you aren’t using it.
			</p>
		{:else if view.update.state === 'installing'}
			<p class="lead">Updating.</p>
		{:else}
			<p class="lead trouble">{view.update.message}</p>
		{/if}
		<p class="lead">It sends only to {host}.</p>
		<p class="lead">
			It reads the recordings the addon writes and the addon’s version number, and Battle.net’s list
			of where the game is installed to find them. It never writes into the game’s folders.
		</p>
		<p class="lead">
			A computer with more than one Battle.net account is linked once per account, and each
			account’s recordings are sent only under its own link. An account nobody has linked sends
			nothing.
		</p>
		<p class="lead">
			It asks {host} for a newer version of itself a little after it starts and every six hours,
			downloads one when there is, and installs it when you ask or by itself once the app has been
			left alone for a while. Its link to your account is kept in Windows Credential Manager.
		</p>
		<p class="lead">
			Using it is covered by the Terms of Service and the Privacy page on {host}. The licence is in
			LICENSE.txt beside the app, and the source is on GitHub.
		</p>
		<p class="actions">
			<button type="button" class="btn-alt" onclick={() => shell.open(shell.server)}
				>Open {SITE_NAME} <Icon name="out" size={13} /></button
			>
			<button type="button" class="btn" onclick={() => shell.open(`${shell.server}/terms`)}
				>Terms of Service <Icon name="out" size={13} /></button
			>
			<button type="button" class="btn" onclick={() => shell.open(`${shell.server}/privacy`)}
				>Privacy <Icon name="out" size={13} /></button
			>
			<button
				type="button"
				class="btn"
				onclick={() => shell.open('https://github.com/WidsithApp/WidsithUploader')}
				>Source <Icon name="out" size={13} /></button
			>
		</p>
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
		padding-top: 20px;
	}
	h2 {
		font-size: 19px;
		font-weight: 600;
		line-height: 1.25;
	}
	h2:not(:first-child) {
		margin-top: 28px;
	}
	h3 {
		margin-top: 22px;
		font-size: 15.5px;
		font-weight: 600;
	}
	.lead {
		margin-top: 6px;
		color: var(--ink-2);
	}
	.lead b {
		color: var(--ink);
		font-weight: 600;
	}
	/* The links, one line each: who, and when play was last sent under it. */
	.links {
		margin-top: 10px;
		display: grid;
		gap: 6px;
	}
	.links li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
	}
	.links b {
		color: var(--ink);
	}
	.links .when {
		color: var(--muted);
		font-size: 14px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		margin-top: 12px;
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
	.folders {
		display: grid;
		gap: 8px;
		margin-top: 14px;
	}
	.folder {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding: 10px 14px;
		box-shadow: none;
	}
	.path {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		user-select: text;
	}
	.none {
		color: var(--muted);
	}
	.trouble {
		margin-top: 10px;
		color: var(--seal);
	}
</style>
