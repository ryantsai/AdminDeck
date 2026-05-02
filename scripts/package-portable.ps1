param(
    [string]$Configuration = "Release",
    [string]$OutputDir = "artifacts",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$PackageJsonPath = Join-Path $RepoRoot "package.json"
$Package = Get-Content -Raw $PackageJsonPath | ConvertFrom-Json
$Version = $Package.version
$TargetTriple = "windows-x64"
$PackageName = "admin-deck-$Version-$TargetTriple-portable"
$TargetDir = Join-Path $RepoRoot "src-tauri\target"
$PortableRoot = Join-Path $TargetDir "portable"
$StageDir = Join-Path $PortableRoot $PackageName
$ResolvedOutputDir = Join-Path $RepoRoot $OutputDir
$ZipPath = Join-Path $ResolvedOutputDir "$PackageName.zip"
$ChecksumPath = "$ZipPath.sha256"
$ExePath = Join-Path $RepoRoot "src-tauri\target\release\admin-deck.exe"

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

if (-not $NoBuild) {
    Push-Location $RepoRoot
    try {
        npm run build
        cargo build --manifest-path src-tauri/Cargo.toml --release
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path $ExePath)) {
    throw "Release executable not found at $ExePath. Run without -NoBuild first."
}

New-Item -ItemType Directory -Force -Path $PortableRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ResolvedOutputDir | Out-Null

Assert-ChildPath -Parent $PortableRoot -Child $StageDir
if (Test-Path $StageDir) {
    Remove-Item -LiteralPath $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

Copy-Item -LiteralPath $ExePath -Destination (Join-Path $StageDir "admin-deck.exe")
Copy-Item -LiteralPath (Join-Path $RepoRoot "LICENSE") -Destination (Join-Path $StageDir "LICENSE")
Copy-Item -LiteralPath (Join-Path $RepoRoot "README.md") -Destination (Join-Path $StageDir "README.md")

$DocsDir = Join-Path $StageDir "docs"
New-Item -ItemType Directory -Force -Path $DocsDir | Out-Null
Copy-Item -LiteralPath (Join-Path $RepoRoot "docs\RELEASE.md") -Destination (Join-Path $DocsDir "RELEASE.md")
Copy-Item -LiteralPath (Join-Path $RepoRoot "docs\PERFORMANCE.md") -Destination (Join-Path $DocsDir "PERFORMANCE.md")

$PortableReadme = @"
AdminDeck portable package

Run admin-deck.exe to start the app. This package is local-first and does not
upload telemetry. Durable Connection metadata remains in the local app data
directory, and secrets remain in the OS keychain.

Requirements:
- Windows 10 or newer
- Microsoft Edge WebView2 Runtime

This portable package does not self-update. Use a newer release package for
normal forward updates.
"@
$PortableReadme | Set-Content -Path (Join-Path $StageDir "PORTABLE-README.txt") -Encoding UTF8

$StagedFiles = Get-ChildItem -Path $StageDir -File -Recurse |
    ForEach-Object {
        $_.FullName.Substring($StageDir.Length + 1).Replace("\", "/")
    } |
    Sort-Object
$ManifestFiles = @($StagedFiles + "manifest.json") | Sort-Object

$Manifest = [ordered]@{
    productName = "AdminDeck"
    version = $Version
    packageType = "windows-portable-zip"
    target = $TargetTriple
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    entrypoint = "admin-deck.exe"
    telemetry = "off"
    portableUpdateBehavior = "self-update-disabled"
    files = $ManifestFiles
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $StageDir "manifest.json") -Encoding UTF8

Assert-ChildPath -Parent $ResolvedOutputDir -Child $ZipPath
if (Test-Path $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}
if (Test-Path $ChecksumPath) {
    Remove-Item -LiteralPath $ChecksumPath -Force
}

Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal
$HashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [System.IO.File]::ReadAllBytes($ZipPath)
)
$Hash = -join ($HashBytes | ForEach-Object { $_.ToString("x2") })
"$Hash  $([System.IO.Path]::GetFileName($ZipPath))" |
    Set-Content -Path $ChecksumPath -Encoding ASCII

[PSCustomObject]@{
    Package = $ZipPath
    Sha256 = $ChecksumPath
    StagingDirectory = $StageDir
    Files = $ManifestFiles.Count
}
