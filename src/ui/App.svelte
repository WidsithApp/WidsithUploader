<script lang="ts">
	// The whole window. A new install greets the player first, once: whether the app starts with
	// Windows, and where it goes when the window is closed. Not linked, it says what the app is and
	// offers the one thing to do; while
	// linking, the code to check against the browser; linked, it asks once how new characters are
	// kept, then has two views, the characters and the settings. A computer with more than one
	// account shows them above the characters, one at a time: when the window is shown it opens on
	// the linked account played most recently, and stays put while it is open.

	import { SITE_NAME } from '../core/config.ts';
	import type { View } from '../core/engine.ts';
	import Accounts from './Accounts.svelte';
	import Cards from './Cards.svelte';
	import type { Controller, Shell } from './controller.ts';
	import Greeting from './Greeting.svelte';
	import Header, { type Tab } from './Header.svelte';
	import Icon from './Icon.svelte';
	import Linking from './Linking.svelte';
	import Settings from './Settings.svelte';
	import Setup from './Setup.svelte';

	let { controller, shell }: { controller: Controller; shell: Shell } = $props();

	let view = $state<View | null>(null);
	$effect(() => controller.subscribe((next) => (view = next)));

	// The window is hidden to the tray rather than closed, so each time it is shown again the
	// player is looking at it: what was new since the last look has now been seen.
	$effect(() => {
		const look = () => {
			if (document.visibilityState === 'visible') {
				void controller.looked();
				picked = null;
			} else controller.left();
		};
		look();
		document.addEventListener('visibilitychange', look);
		return () => document.removeEventListener('visibilitychange', look);
	});

	let tab = $state<Tab>('characters');

	/**
	 * The account being looked at: the one the player picked since the window was shown, else the
	 * linked account played most recently, else the unlinked ones. `others` is every account nobody
	 * has linked, as one view.
	 */
	let picked = $state<string | 'others' | null>(null);
	const current = $derived.by((): string | 'others' | null => {
		if (!view) return null;
		const stillThere =
			picked === 'others'
				? view.accounts.some((a) => !a.linked)
				: view.accounts.some((a) => a.linked && a.id === picked);
		if (picked !== null && stillThere) return picked;
		const recent = view.accounts.find((a) => a.linked && a.id !== null);
		if (recent?.id) return recent.id;
		return view.accounts.some((a) => !a.linked) ? 'others' : null;
	});
	/** The characters of the account being looked at. A folder that doesn't say whose it is goes with the one link. */
	const shown = $derived.by(() => {
		const now = view;
		if (!now) return [];
		if (current === 'others') {
			const unlinked = new Set(now.accounts.filter((a) => !a.linked).map((a) => a.id));
			return now.characters.filter((c) => unlinked.has(c.account));
		}
		const oneLink = now.links.length === 1;
		return now.characters.filter(
			(c) => c.account === current || (c.account === null && oneLink)
		);
	});
	const others = $derived(view?.accounts.filter((a) => !a.linked) ?? []);
	const currentAccount = $derived(view?.accounts.find((a) => a.linked && a.id === current) ?? null);
	/** Whose start is up, named only when there is more than one account to tell apart. */
	const setupFor = $derived.by(() => {
		const now = view;
		if (!now?.setup || (now.links.length <= 1 && now.accounts.length <= 1)) return null;
		const id = now.setup;
		return now.links.find((l) => l.id === id)?.battletag ?? null;
	});

	/** Which way of linking was just asked for, until the site has answered with a code. */
	let starting = $state<'open' | 'copy' | null>(null);
	async function link(open: boolean) {
		starting = open ? 'open' : 'copy';
		try {
			await controller.link(open);
		} finally {
			starting = null;
		}
	}

	/** Said under the folders when the folder picked isn't one. */
	let folderNote = $state<string | null>(null);
	async function addFolder() {
		folderNote = null;
		const { root, picked } = await shell.pickFolder();
		if (root) await controller.addRoot(root);
		else if (picked) {
			folderNote =
				'That folder doesn’t hold World of Warcraft. Choose the folder named World of Warcraft itself.';
		}
	}

	const host = $derived(new URL(shell.server).host);
	/** The two views are offered once the first look is done, unless a one-time screen is up. */
	const settled = $derived(
		view !== null && view.ready && !view.greeting && !view.setup && !view.linking
	);
</script>

<div class="frame">
	<Header
		tabs={settled}
		{tab}
		battletag={view?.linked
			? (currentAccount?.battletag ?? view.links[0]?.battletag ?? view.battletag ?? 'Linked')
			: null}
		ontab={(next) => (tab = next)}
	/>

	<main>
		{#if view?.greeting}
			<Greeting
				ontaskbar={shell.openTaskbarSettings}
				oncontinue={async (starts) => {
					await shell.setStartsWithWindows(starts).catch(() => {});
					await controller.greet();
				}}
			/>
		{:else if !view || !view.ready}
			<p class="lead" role="status">Looking for your recordings.</p>
		{:else}
			{#if view.notice}
				<p class="notice" role="status">{view.notice}</p>
			{/if}
			{#if view.paused && view.linked && !view.linking}
				<div class="paused sheet" role="status">
					<Icon name="pause" size={18} />
					<p>
						<b>Uploading is paused.</b> Nothing is sent to {SITE_NAME} until you resume it, here or
						from the tray.
					</p>
					<button type="button" class="btn-main" onclick={() => controller.setPaused(false)}
						>Resume</button
					>
				</div>
			{/if}
			{#if view.update}
				<div class="update" role="status">
					{#if view.update.state === 'downloading'}
						<p>Version {view.update.version} is on its way.</p>
						<span class="bar" aria-hidden="true"
							><span style:width="{Math.round((view.update.progress ?? 0) * 100)}%"></span></span
						>
					{:else if view.update.state === 'ready'}
						<p>Version {view.update.version} is ready.</p>
						<button type="button" class="btn-alt" onclick={() => controller.installUpdate()}
							>Restart to update</button
						>
					{:else if view.update.state === 'installing'}
						<p>Updating.</p>
					{:else}
						<p class="failed">{view.update.message}</p>
					{/if}
				</div>
			{/if}

			{#if view.linking}
				<Linking
					linking={view.linking}
					{host}
					browser={view.browser}
					oncopy={shell.copy}
					onreopen={() => controller.reopenLink()}
					oncancel={() => controller.cancelLink()}
				/>
			{:else if view.setup}
				{@const of = view.setup}
				{@const oneLink = view.links.length === 1}
				<Setup
					battletag={setupFor}
					characters={view.characters.filter(
						(c) => c.account === of || (c.account === null && oneLink)
					)}
					onswitch={(key, on) => controller.setUploading(key, on)}
					onstart={() => controller.beginUploading(of)}
				/>
			{:else if tab === 'settings'}
				<Settings {view} {controller} {shell} {folderNote} onaddfolder={addFolder} />
			{:else if !view.linked}
				<section class="intro">
					<p class="lead">
						The {SITE_NAME} addon writes each character’s recording when you log out, reload, or
						save from its icon by the minimap. This app notices the new play and sends it to
						{SITE_NAME}, so you never have to find the file yourself. Link this computer to your
						{SITE_NAME} account to begin.
					</p>
					<p class="begin">
						<button
							type="button"
							class="btn-main"
							disabled={starting !== null}
							onclick={() => link(true)}
						>
							{starting === 'open'
								? 'Opening…'
								: `Open ${view.browser ?? 'your browser'} to link this computer`}
							<Icon name="out" size={13} />
						</button>
					</p>
					<p class="small">
						<button
							type="button"
							class="link quiet"
							disabled={starting !== null}
							onclick={() => link(false)}
							>{starting === 'copy' ? 'One moment…' : 'Copy a link for another browser instead'}</button
						>
					</p>
					<p class="small">
						Nothing is sent until you have linked it and said how new characters are kept.
					</p>
					<p class="small">
						By linking it you agree to the
						<button type="button" class="link" onclick={() => shell.open(`${shell.server}/terms`)}
							>Terms of Service</button
						>
						and the
						<button type="button" class="link" onclick={() => shell.open(`${shell.server}/privacy`)}
							>Privacy page</button
						> on {host}.
					</p>
				</section>
				{#if view.characters.length}
					<section class="found">
						<p class="caption found-label">Found on this computer</p>
						<Cards {view} {controller} {shell} onaddfolder={addFolder} />
					</section>
				{/if}
			{:else}
				<Accounts accounts={view.accounts} current={current ?? 'others'} onpick={(id) => (picked = id)} />
				{#if current === 'others'}
					<!-- Accounts nobody has linked: their recordings are found and shown, and sent nowhere.
					     Whoever signs in on the site is the account linked, so the words say to sign in as it. -->
					<section class="others sheet">
						<h2 class="display">
							{others.length === 1
								? 'Another account plays on this computer'
								: `${others.length} other accounts play on this computer`}
						</h2>
						<p>
							{others.length === 1 ? 'Its' : 'Their'} recordings are found here and sent nowhere. To
							send {others.length === 1 ? 'them' : 'an account’s'}, link {others.length === 1
								? 'that account'
								: 'it'}: sign in on {host} as {others.length === 1 ? 'it' : 'that account'} when the
							page opens.
						</p>
						<p class="actions">
							<button
								type="button"
								class="btn-main"
								disabled={starting !== null}
								onclick={() => link(true)}
							>
								{starting === 'open'
									? 'Opening…'
									: `Open ${view.browser ?? 'your browser'} to link an account`}
								<Icon name="out" size={13} />
							</button>
							<button
								type="button"
								class="link quiet"
								disabled={starting !== null}
								onclick={() => link(false)}
								>{starting === 'copy' ? 'One moment…' : 'Copy a link for another browser'}</button
							>
						</p>
					</section>
					<section class="found">
						<p class="caption found-label">Found on this computer</p>
						<Cards {view} characters={shown} {controller} {shell} onaddfolder={addFolder} />
					</section>
				{:else}
					<Cards {view} characters={shown} {controller} {shell} onaddfolder={addFolder} />
				{/if}
				{#if folderNote}
					<p class="trouble" role="status">{folderNote}</p>
				{/if}
			{/if}
		{/if}
	</main>
</div>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	main {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 22px 18px 28px;
	}
	.lead {
		margin-top: 8px;
		color: var(--ink-2);
	}
	.begin {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		margin-top: 20px;
	}
	.small {
		margin-top: 14px;
		color: var(--muted);
		font-size: 14px;
	}
	.found {
		margin-top: 32px;
		padding-top: 18px;
		border-top: 1px solid var(--rule);
	}
	/* The unlinked accounts' view: what they are and the one thing to do, then their cards. */
	.others {
		padding: 16px 18px;
	}
	.others h2 {
		font-size: 19px;
		font-weight: 600;
		line-height: 1.25;
	}
	.others p {
		margin-top: 8px;
		color: var(--ink-2);
	}
	.others .actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		margin-top: 14px;
	}
	.others + .found {
		margin-top: 24px;
		padding-top: 0;
		border-top: 0;
	}
	.found-label {
		margin-bottom: 12px;
	}
	.notice {
		margin-bottom: 18px;
		padding-left: 12px;
		border-left: 3px solid var(--seal);
		color: var(--seal);
	}
	.trouble {
		margin-top: 10px;
		color: var(--seal);
	}
	/* Paused from the tray: said plainly above everything, with the one thing to do about it. */
	.paused {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
		padding: 12px 14px;
		border-color: color-mix(in oklab, var(--seal) 45%, var(--rule-2));
		background: color-mix(in oklab, var(--seal) 7%, var(--card));
		color: var(--ink-2);
	}
	.paused > :global(svg) {
		flex: none;
		color: var(--seal);
	}
	.paused p {
		flex: 1;
	}
	.paused b {
		color: var(--ink);
	}
	.paused .btn-main {
		flex: none;
	}
	/* A newer version of the app: one quiet line, tinted in the accent, until it has gone in. */
	.update {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		margin-bottom: 16px;
		padding: 6px 8px 6px 14px;
		border-radius: 12px;
		background: var(--accent-wash);
		color: var(--ink-2);
	}
	.update p {
		flex: 1;
	}
	.update .failed {
		color: var(--seal);
	}
	.update .btn-alt {
		flex: none;
		padding: 6px 12px;
		font-size: 14px;
	}
	.bar {
		flex: none;
		width: 96px;
		height: 3px;
		margin-right: 6px;
		border-radius: 2px;
		background: color-mix(in oklab, var(--accent) 20%, transparent);
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width var(--t-fast) var(--ease-out);
	}
</style>
