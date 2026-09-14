<#
.SYNOPSIS
  Watchdog for tools/fivem-uplink.mjs.

.DESCRIPTION
  The uplink only launches once, at logon, via the "FiveM uplink.vbs" shortcut
  in the Startup folder. If the process (or its cloudflared tunnel) dies mid-
  session — free trycloudflare.com quick tunnels do drop — nothing relaunches
  it until the next reboot/logon, and the dashboard silently loses the live
  roster until someone notices. That happened on 2026-09-11: the process died
  around 12:25 PM with no error logged and stayed dead for ~9 hours despite the
  PC staying on.

  This script is meant to run on a schedule (see the Scheduled Task setup
  below): if no `node.exe` process is running fivem-uplink.mjs, relaunch it
  exactly the way the Startup shortcut does. A healthy uplink is left alone —
  idempotent, safe to run as often as the schedule fires.

.NOTES
  Registered once as a per-user Scheduled Task (no admin rights, no stored
  password — runs only while the user is logged on, same assumption the
  Startup shortcut already makes):

    schtasks /create /tn "FiveM Uplink Watchdog" /sc minute /mo 5 /rl limited /f ^
      /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\Users\ADMIN\crimson-creed-dashboard\tools\fivem-uplink-watchdog.ps1\""

  Watchdog-triggered relaunches are logged to
  %LOCALAPPDATA%\fivem-uplink\watchdog.log (separate from uplink.log so it is
  obvious which restarts were automatic). A healthy check writes nothing, so
  the log only grows when it actually does something.
#>

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA "fivem-uplink"
$logFile = Join-Path $logDir "watchdog.log"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log([string]$line) {
    $stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    Add-Content -Path $logFile -Value "$stamp [watchdog] $line"
}

$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*fivem-uplink.mjs*" }

if ($running) {
    exit 0
}

Write-Log "uplink not running - relaunching"
try {
    $shell = New-Object -ComObject WScript.Shell
    $shell.CurrentDirectory = $repoRoot
    $shell.Run('"C:\Program Files\nodejs\node.exe" tools\fivem-uplink.mjs', 0, $false)
    Write-Log "relaunch command issued"
}
catch {
    Write-Log "relaunch failed: $($_.Exception.Message)"
}
