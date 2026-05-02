param(
  [switch]$KeepGoing
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $env:ADMINDECK_SSH_HOST) {
  throw "Set ADMINDECK_SSH_HOST before measuring SSH terminal readiness."
}

if (-not $env:ADMINDECK_SSH_KNOWN_HOSTS_PATH -and $env:APPDATA) {
  $env:ADMINDECK_SSH_KNOWN_HOSTS_PATH = Join-Path $env:APPDATA "com.admindeck.app\ssh_known_hosts"
}

Write-Host "Measuring AdminDeck native SSH terminal readiness after auth..."
Write-Host "Host: $env:ADMINDECK_SSH_HOST"
Write-Host "Port: $(if ($env:ADMINDECK_SSH_PORT) { $env:ADMINDECK_SSH_PORT } else { "22" })"
Write-Host "Auth: $(if ($env:ADMINDECK_SSH_AUTH) { $env:ADMINDECK_SSH_AUTH } elseif ($env:ADMINDECK_SSH_PASSWORD) { "password" } elseif ($env:ADMINDECK_SSH_KEY_PATH) { "keyFile" } else { "agent" })"
Write-Host "Known hosts: $env:ADMINDECK_SSH_KNOWN_HOSTS_PATH"

$cargoArgs = @(
  "test",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "measure_native_ssh_terminal_readiness_after_auth",
  "--",
  "--ignored",
  "--exact",
  "--nocapture"
)

if ($KeepGoing) {
  & cargo @cargoArgs
  exit $LASTEXITCODE
}

& cargo @cargoArgs
