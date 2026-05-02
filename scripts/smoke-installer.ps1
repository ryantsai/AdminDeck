param(
    [string]$OutputDir = "artifacts",
    [string]$InstallerPath,
    [string]$InstallDir,
    [switch]$SkipChecksum,
    [switch]$KeepInstall
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$PackageJsonPath = Join-Path $RepoRoot "package.json"
$Package = Get-Content -Raw $PackageJsonPath | ConvertFrom-Json
$Version = $Package.version
$TargetTriple = "windows-x64"
$ResolvedOutputDir = Join-Path $RepoRoot $OutputDir

if (-not $InstallerPath) {
    $InstallerPath = Join-Path $ResolvedOutputDir "admin-deck-$Version-$TargetTriple-setup.exe"
}

$ResolvedInstallerPath = Resolve-Path $InstallerPath
$ChecksumPath = "$ResolvedInstallerPath.sha256"
$OwnsInstallDir = -not $PSBoundParameters.ContainsKey("InstallDir")

if ($OwnsInstallDir) {
    $InstallDir = Join-Path ([System.IO.Path]::GetTempPath()) "admin-deck-installer-smoke-$([System.Guid]::NewGuid().ToString("N"))"
}

$ResolvedInstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$InstalledExe = Join-Path $ResolvedInstallDir "admin-deck.exe"
$Uninstaller = Join-Path $ResolvedInstallDir "uninstall.exe"

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

function Invoke-CheckedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$Action
    )

    $Process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -Wait `
        -PassThru `
        -WindowStyle Hidden

    if ($Process.ExitCode -ne 0) {
        throw "$Action failed with exit code $($Process.ExitCode)."
    }
}

if (-not (Test-Path $ResolvedInstallerPath)) {
    throw "Installer not found at $ResolvedInstallerPath. Run npm run package:installer first."
}

if (-not $SkipChecksum) {
    if (-not (Test-Path $ChecksumPath)) {
        throw "Installer checksum not found at $ChecksumPath."
    }

    $ExpectedHash = ((Get-Content -Raw $ChecksumPath).Trim() -split "\s+")[0].ToLowerInvariant()
    $HashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.IO.File]::ReadAllBytes($ResolvedInstallerPath)
    )
    $ActualHash = (-join ($HashBytes | ForEach-Object { $_.ToString("x2") })).ToLowerInvariant()
    if ($ActualHash -ne $ExpectedHash) {
        throw "Installer checksum mismatch. Expected $ExpectedHash but found $ActualHash."
    }
}

if (Test-Path $ResolvedInstallDir) {
    if (-not $OwnsInstallDir) {
        throw "Install directory already exists: $ResolvedInstallDir"
    }

    Assert-ChildPath -Parent ([System.IO.Path]::GetTempPath()) -Child $ResolvedInstallDir
    if (-not ([System.IO.Path]::GetFileName($ResolvedInstallDir).StartsWith("admin-deck-installer-smoke-"))) {
        throw "Refusing to clean unexpected smoke-test directory: $ResolvedInstallDir"
    }
    Remove-Item -LiteralPath $ResolvedInstallDir -Recurse -Force
}

$InstallSucceeded = $false
try {
    Invoke-CheckedProcess `
        -FilePath $ResolvedInstallerPath `
        -ArgumentList @("/S", "/D=$ResolvedInstallDir") `
        -Action "Silent installer smoke test"

    if (-not (Test-Path $InstalledExe)) {
        throw "Silent installer completed but admin-deck.exe was not found at $InstalledExe."
    }

    $InstalledItem = Get-Item -LiteralPath $InstalledExe
    if ($InstalledItem.Length -le 0) {
        throw "Installed admin-deck.exe is empty."
    }

    $InstallSucceeded = $true
}
finally {
    if ((Test-Path $Uninstaller) -and -not $KeepInstall) {
        Invoke-CheckedProcess `
            -FilePath $Uninstaller `
            -ArgumentList @("/S") `
            -Action "Silent installer cleanup"
    }

    if ($OwnsInstallDir -and -not $KeepInstall -and (Test-Path $ResolvedInstallDir)) {
        Assert-ChildPath -Parent ([System.IO.Path]::GetTempPath()) -Child $ResolvedInstallDir
        if (-not ([System.IO.Path]::GetFileName($ResolvedInstallDir).StartsWith("admin-deck-installer-smoke-"))) {
            throw "Refusing to clean unexpected smoke-test directory: $ResolvedInstallDir"
        }
        Remove-Item -LiteralPath $ResolvedInstallDir -Recurse -Force
    }
}

[PSCustomObject]@{
    Installer = $ResolvedInstallerPath.Path
    ChecksumVerified = -not $SkipChecksum
    InstallDirectory = $ResolvedInstallDir
    InstalledExecutable = $InstalledExe
    SilentInstall = $InstallSucceeded
    Cleanup = if ($KeepInstall) { "kept" } else { "removed" }
}
