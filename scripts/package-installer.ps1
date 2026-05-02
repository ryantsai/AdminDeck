param(
    [string]$OutputDir = "artifacts"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$PackageJsonPath = Join-Path $RepoRoot "package.json"
$Package = Get-Content -Raw $PackageJsonPath | ConvertFrom-Json
$Version = $Package.version
$TargetTriple = "windows-x64"
$OutputName = "admin-deck-$Version-$TargetTriple-setup.exe"
$ResolvedOutputDir = Join-Path $RepoRoot $OutputDir
$InstallerOutputPath = Join-Path $ResolvedOutputDir $OutputName
$ChecksumPath = "$InstallerOutputPath.sha256"
$BundleDir = Join-Path $RepoRoot "src-tauri\target\release\bundle\nsis"

function Assert-ChildPath {
    param(
        [string]$Parent,
        [string]$Child
    )

    $ResolvedParent = [System.IO.Path]::GetFullPath($Parent)
    $ResolvedChild = [System.IO.Path]::GetFullPath($Child)
    if (-not $ResolvedChild.StartsWith($ResolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify path outside $ResolvedParent`: $ResolvedChild"
    }
}

Push-Location $RepoRoot
try {
    npm exec tauri -- build --bundles=nsis --no-sign
}
finally {
    Pop-Location
}

if (-not (Test-Path $BundleDir)) {
    throw "NSIS bundle directory not found at $BundleDir."
}

$BuiltInstaller = Get-ChildItem -Path $BundleDir -Filter "*.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $BuiltInstaller) {
    throw "No NSIS installer executable found in $BundleDir."
}

New-Item -ItemType Directory -Force -Path $ResolvedOutputDir | Out-Null

Assert-ChildPath -Parent $ResolvedOutputDir -Child $InstallerOutputPath
if (Test-Path $InstallerOutputPath) {
    Remove-Item -LiteralPath $InstallerOutputPath -Force
}
if (Test-Path $ChecksumPath) {
    Remove-Item -LiteralPath $ChecksumPath -Force
}

Copy-Item -LiteralPath $BuiltInstaller.FullName -Destination $InstallerOutputPath

$HashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [System.IO.File]::ReadAllBytes($InstallerOutputPath)
)
$Hash = -join ($HashBytes | ForEach-Object { $_.ToString("x2") })
"$Hash  $([System.IO.Path]::GetFileName($InstallerOutputPath))" |
    Set-Content -Path $ChecksumPath -Encoding ASCII

[PSCustomObject]@{
    Installer = $InstallerOutputPath
    Sha256 = $ChecksumPath
    SourceInstaller = $BuiltInstaller.FullName
}
