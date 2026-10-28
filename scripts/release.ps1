# Ships a release of the uploader from start to finish, and stops at the first thing that is
# missing rather than part-way through:
#
#   0. a clean working tree, and a version to go to (0.2.1, or patch, minor, major); this
#      repository on main and the same as GitHub's main; the site's checkout, when WIDSITH_SITE
#      names one, on a branch of its own
#   1. the update signing key, in the user's profile folder (TAURI_SIGNING_PRIVATE_KEY)
#   2. an Azure CLI signed in, which the certificate signing borrows (az login)
#   3. no copy of the app running, which would hold its own exe open
#   4. the version raised in every file that carries it, committed and tagged v<version>
#   5. npm run release: the signed app, its installer and the updater's signature
#   6. the installer's signatures checked
#   7. when WIDSITH_SITE names a checkout of the site's source, its npm run pack-uploader, which
#      copies the installer and writes the update feed, and that committed on the site's branch
#
# Run from this folder:   npm run ship -- 0.2.1     (or: npm run ship -- patch)
# It pushes nothing: it ends by saying what to push, in which repository. `npm run build` is for
# building and trying the app on this computer; this is for handing it out.

param([string]$Version)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSScriptRoot

function Stop-Here($message) {
	Write-Host ''
	Write-Host "ship: $message" -ForegroundColor Red
	exit 1
}

function Run($command, [string[]]$arguments, $failure) {
	& $command @arguments
	if ($LASTEXITCODE -ne 0) { Stop-Here $failure }
}

Push-Location $here
try {
	# 0. Which version, from a clean tree, so the release is one commit anyone can find again.
	if (-not $Version) {
		$current = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
		Stop-Here "say which version to ship: npm run ship -- 0.2.1 (or patch, minor, major). The app is $current now."
	}
	$dirty = & git status --porcelain
	if ($dirty) {
		Stop-Here "the working tree has changes that aren't committed. Commit or stash them first, so the release is one commit:`n$($dirty -join "`n")"
	}

	# Only merged code is released: this repository's main, exactly as GitHub has it. A release
	# built from a branch reaches players before its pull request is merged, and main then no
	# longer matches what they run.
	$branch = "$(& git branch --show-current)".Trim()
	if ($branch -ne 'main') {
		Stop-Here "releases are built from main, and this checkout is on '$branch'. Merge its pull request first, then: git switch main; git pull"
	}
	& git fetch --quiet origin main
	if ($LASTEXITCODE -ne 0) {
		Stop-Here "GitHub couldn't be reached to check that main is up to date (git fetch origin main failed)."
	}
	$counts = "$(& git rev-list --left-right --count HEAD...origin/main)".Trim() -split '\s+'
	if ($counts[0] -ne '0' -or $counts[1] -ne '0') {
		Stop-Here "main here isn't the same as main on GitHub: $($counts[0]) commit(s) only here, $($counts[1]) only there. Run git pull, and push or undo any commit that is only here, then run this again."
	}

	# The site's checkout, when WIDSITH_SITE names one, takes the installer as a commit (step 7).
	# That commit goes on a branch of the site's own, merged by pull request like any other change.
	$site = $env:WIDSITH_SITE
	if ($site -and (Test-Path (Join-Path $site 'scripts\pack-uploader.mjs'))) {
		$siteBranch = "$(& git -C $site branch --show-current)".Trim()
		if ($siteBranch -eq 'main' -or -not $siteBranch) {
			Stop-Here "the site's checkout is on main, where the installer would be committed. Give it a branch first, from the site's folder: git switch -c uploader-<version>"
		}
		Write-Host "ship: the site's download will be committed on its branch '$siteBranch'"
	}

	# 1. The update signing key.
	if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
		$key = Join-Path $env:USERPROFILE '.tauri\widsith-uploader.key'
		if (-not (Test-Path $key)) {
			Stop-Here "the update signing key is not at $key. Restore it from your backup; without it no installed copy will accept this release as an update."
		}
		$env:TAURI_SIGNING_PRIVATE_KEY = $key
	}
	# The key's password, asked for here rather than by the build (which runs with --ci and would
	# take none). Set TAURI_SIGNING_PRIVATE_KEY_PASSWORD beforehand to skip the question; answer
	# nothing for a key that has no password.
	if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
		$secret = Read-Host -AsSecureString 'ship: the update key''s password (Enter if it has none)'
		$plain = [Runtime.InteropServices.Marshal]::PtrToStringUni(
			[Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secret))
		if ($plain) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $plain }
	}

	# 2. The certificate signing borrows the Azure CLI's sign-in.
	$azDir = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
	if ((Test-Path $azDir) -and ($env:Path -notlike "*$azDir*")) { $env:Path += ";$azDir" }
	if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
		Stop-Here 'the Azure CLI (az) was not found. The installer is signed through it; see the README under Signing.'
	}
	$account = & az account show --query user.name -o tsv 2>$null
	if (-not $account) {
		Stop-Here 'the Azure CLI is not signed in. Run: az login'
	}
	Write-Host "ship: signing as $account"

	# 3. A running copy holds its exe open, and the build can't replace it.
	if (Get-Process -Name 'widsith-uploader' -ErrorAction SilentlyContinue) {
		Stop-Here 'Widsith Uploader is running. Quit it from the tray, then run this again.'
	}

	# 4. The version, in every file that carries it, as one commit with a tag.
	$new = & node scripts/bump-version.mjs $Version
	if ($LASTEXITCODE -ne 0 -or -not $new) { Stop-Here 'the version was not raised; see above.' }
	$new = "$new".Trim()
	Run git @('add', 'package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock') 'staging the version failed.'
	Run git @('commit', '-q', '-m', "$new") 'committing the version failed.'
	Run git @('tag', "v$new") "tagging v$new failed (does the tag exist already?)."
	Write-Host "ship: version $new committed and tagged v$new"

	# 5. The build.
	Run npm @('run', 'release') "the build failed; see above. The version commit stays: fix the cause and run npm run release again, or undo it with git reset --hard HEAD~1 and git tag -d v$new"

	# 6. The installer, and its two signatures.
	$bundle = Join-Path $here 'src-tauri\target\release\bundle\nsis'
	$installer = Join-Path $bundle "Widsith Uploader_${new}_x64-setup.exe"
	if (-not (Test-Path $installer)) { Stop-Here "no installer at $installer" }
	if (-not (Test-Path "$installer.sig")) { Stop-Here 'the installer has no updater signature (.sig) beside it; the update key was not used.' }
	$signature = Get-AuthenticodeSignature $installer
	if ($signature.Status -ne 'Valid') {
		Stop-Here "the installer's certificate signature is $($signature.Status), not Valid."
	}
	Write-Host "ship: $installer"
	Write-Host "ship: signed by $($signature.SignerCertificate.Subject -replace ',.*',''), timestamped: $($null -ne $signature.TimeStamperCertificate)"
} finally {
	Pop-Location
}

# 7. The site's checkout, which hands the installer out and serves the update feed.
$web = $env:WIDSITH_SITE
if (-not ($web -and (Test-Path (Join-Path $web 'scripts\pack-uploader.mjs')))) {
	Write-Host ''
	Write-Host 'ship: built. WIDSITH_SITE names no checkout of the site, so the installer was not packed for it.' -ForegroundColor Green
	Write-Host "ship: push the uploader with its tag:   git push origin main v$new"
	exit 0
}
Push-Location $web
try {
	$env:WIDSITH_PACK_SIGNED = '1'
	Run npm @('run', 'pack-uploader', '--', '--signed') 'packing the installer for the site failed; see above.'
	# The three files the pack writes, and the previous installer it removed. Staged by name: this
	# checkout may hold other work.
	Run git @('add', 'src/lib/site/uploader.json', 'static/downloads/uploader-update.json', "static/downloads/Widsith-Uploader-$new-setup.exe") 'staging the download on the site failed.'
	Run git @('add', '-u', 'static/downloads') 'staging the previous download for removal failed.'
	Run git @('commit', '-q', '-m', "web: the uploader's download is $new, signed, with its update feed") 'committing the download on the site failed.'
	$siteBranch = "$(& git branch --show-current)".Trim()
} finally {
	Pop-Location
}

$appBranch = "$(& git -C $here branch --show-current)".Trim()
Write-Host ''
Write-Host "ship: $new is built, signed, packed and committed in both repositories. To hand it out, push:" -ForegroundColor Green
Write-Host "  git push origin $appBranch v$new        (from this folder)"
Write-Host "  git push origin $siteBranch        (from the site's checkout, then merge it as usual)"
