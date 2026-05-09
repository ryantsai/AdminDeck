param(
  [switch]$KeepGoing
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $env:KKTERM_SSH_HOST) {
  throw "Set KKTERM_SSH_HOST before measuring SSH terminal readiness."
}

if (-not $env:KKTERM_SSH_KNOWN_HOSTS_PATH -and $env:APPDATA) {
  $env:KKTERM_SSH_KNOWN_HOSTS_PATH = Join-Path $env:APPDATA "com.kkterm.app\ssh_known_hosts"
}

Write-Host "Measuring KKTerm native SSH terminal readiness after auth..."
Write-Host "Host: $env:KKTERM_SSH_HOST"
Write-Host "Port: $(if ($env:KKTERM_SSH_PORT) { $env:KKTERM_SSH_PORT } else { "22" })"
Write-Host "Auth: $(if ($env:KKTERM_SSH_AUTH) { $env:KKTERM_SSH_AUTH } elseif ($env:KKTERM_SSH_PASSWORD) { "password" } elseif ($env:KKTERM_SSH_KEY_PATH) { "keyFile" } else { "agent" })"
Write-Host "Known hosts: $env:KKTERM_SSH_KNOWN_HOSTS_PATH"

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
