<#
.SYNOPSIS
  Brings up the FiveM uplink: the local relay plus the ngrok tunnel in front of it.

.DESCRIPTION
  The game server only answers Indonesian residential connections, so a deployed
  dashboard cannot read it directly (see tools/fivem-relay.mjs for why). This
  script runs the relay on this machine and publishes it on a *reserved* ngrok
  hostname, so the deployment's FIVEM_SERVER_URL is set once and never again --
  unlike a quick tunnel, whose URL changes on every restart.

  Both processes start hidden and log to %LOCALAPPDATA%\fivem-uplink\. Re-running
  replaces the previous pair, so it is safe to call from a logon task.

.PARAMETER Domain
  The reserved ngrok hostname, e.g. crimson-creed.ngrok-free.app. Defaults to the
  FIVEM_NGROK_DOMAIN environment variable.

.PARAMETER Stop
  Tear the uplink down instead of starting it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\fivem-uplink.ps1 -Domain crimson-creed.ngrok-free.app
#>
[CmdletBinding()]
param(
  [string]$Domain = $env:FIVEM_NGROK_DOMAIN,
  [int]$Port = 8787,
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$relay = Join-Path $repoRoot 'tools\fivem-relay.mjs'
$logDir = Join-Path $env:LOCALAPPDATA 'fivem-uplink'
New-Item -ItemType Directory -Force $logDir | Out-Null

# Match on the command line rather than the image name: plain "node" or "ngrok"
# would sweep up whatever else the machine happens to be running.
function Stop-Uplink {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'ngrok.exe'" |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match 'fivem-relay\.mjs' -or $_.CommandLine -match "--domain=") } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Resolve-Exe([string]$name, [string[]]$fallbacks, [string]$hint) {
  $found = @()
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { $found += $cmd.Source }
  foreach ($f in $fallbacks) { if ($f -and (Test-Path $f)) { $found += $f } }
  if ($found.Count -eq 0) { throw "$name not found. $hint" }
  return $found[0]
}

if ($Stop) {
  Stop-Uplink
  Write-Host "[uplink] stopped."
  return
}

if (-not $Domain) {
  throw "No ngrok domain. Pass -Domain <host>.ngrok-free.app or set FIVEM_NGROK_DOMAIN."
}

$node = Resolve-Exe 'node' @("$env:ProgramFiles\nodejs\node.exe") 'Install Node.js.'
$ngrok = Resolve-Exe 'ngrok' @(
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe",
  "$env:LOCALAPPDATA\fivem-uplink\ngrok.exe"
) 'Install it with: winget install ngrok.ngrok'

Stop-Uplink

Start-Process -FilePath $node -ArgumentList @($relay) -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir 'relay.log') `
  -RedirectStandardError (Join-Path $logDir 'relay.err.log')

Start-Process -FilePath $ngrok -ArgumentList @('http', "--domain=$Domain", '--log=stdout', "$Port") `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir 'ngrok.log') `
  -RedirectStandardError (Join-Path $logDir 'ngrok.err.log')

# The tunnel needs a moment to register upstream; report the real state rather
# than claiming success the instant the processes exist.
$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 800
  try {
    $probe = Invoke-WebRequest -Uri "https://$Domain/health" -TimeoutSec 5 -UseBasicParsing
    if ($probe.StatusCode -eq 200) {
      Write-Host "[uplink] live at https://$Domain (relay port $Port)"
      return
    }
  } catch { }
} while ((Get-Date) -lt $deadline)

Write-Warning "[uplink] processes started but https://$Domain/health did not answer. See $logDir."
exit 1
