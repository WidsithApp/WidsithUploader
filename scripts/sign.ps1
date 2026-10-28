# Signs one file with the company's certificate through Azure Artifact Signing.
#
# Tauri runs this for the app and for the installer during `npm run build`
# (bundle.windows.signCommand in src-tauri/tauri.conf.json). It can also be run
# by hand: powershell -File scripts/sign.ps1 path\to\file.exe
#
# It needs, on the machine that builds a release:
#   - the Artifact Signing client tools (winget install -e --id Microsoft.Azure.ArtifactSigningClientTools)
#   - SignTool from a Windows SDK of build 22621 or later
#   - a signed-in Azure CLI (az login) for an account that holds the
#     "Artifact Signing Certificate Profile Signer" role on the certificate profile
#
# On a machine without the client tools it says so and leaves the file unsigned,
# so that anyone can build the app locally. A release is only ever built where
# the tools are. The account and profile are named in signing.json beside this
# script; there is nothing secret in it.

param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = 'Stop'

$dlib = Join-Path $env:LOCALAPPDATA 'Microsoft\MicrosoftArtifactSigningClientTools\Azure.CodeSigning.Dlib.dll'
if (-not (Test-Path $dlib)) {
	Write-Host "sign: Artifact Signing client tools are not installed; $File is left unsigned."
	exit 0
}

$kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
$signtool = Get-ChildItem $kits -Directory -ErrorAction SilentlyContinue |
	Where-Object { $_.Name -match '^10\.0\.(\d+)\.' -and [int]$Matches[1] -ge 22621 } |
	Sort-Object { [version]$_.Name } -Descending |
	ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
	Where-Object { Test-Path $_ } |
	Select-Object -First 1
if (-not $signtool) {
	Write-Error "sign: no signtool.exe from a Windows SDK of build 22621 or later under $kits."
	exit 1
}

# The signing library finds the Azure CLI on the PATH to borrow its sign-in.
$azDir = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
if ((Test-Path $azDir) -and ($env:Path -notlike "*$azDir*")) { $env:Path += ";$azDir" }

$metadata = Join-Path $PSScriptRoot 'signing.json'

& $signtool sign /fd SHA256 /tr 'http://timestamp.acs.microsoft.com' /td SHA256 `
	/dlib $dlib /dmdf $metadata $File
exit $LASTEXITCODE
