<#
.SYNOPSIS
    Copies all PrismPane source files to ../PrismPane-Editor-Backup, excluding build artifacts
    and auto-generated files that would be recreated by npm install or tauri build.
.DESCRIPTION
    Copies: .gitignore, AGENTS.md, .vscode/, public/, src/, index.html, package.json,
    tsconfig*.json, vite.config.ts, test*.js/mjs, src-tauri/ (excluding target/, gen/,
    Cargo.lock), and root config files.
    Excludes: node_modules/, dist/, src-tauri/target/, src-tauri/gen/,
    package-lock.json, src-tauri/Cargo.lock.
#>

$ErrorActionPreference = "Stop"

$sourceDir = $PSScriptRoot
$destDir   = Join-Path $PSScriptRoot "..\PrismPane-Editor-Backup"

# Ensure the destination exists
if (-not (Test-Path $destDir)) {
    Write-Error "Destination directory does not exist: $destDir"
    exit 1
}

Write-Host "Copying PrismPane source files from:" -ForegroundColor Cyan
Write-Host "  $sourceDir" -ForegroundColor Gray
Write-Host "  -> $destDir" -ForegroundColor Gray
Write-Host ""

# --- Robocopy: entire source tree with exclusions ---
# /E  : copy subdirectories including empty ones
# /NJH: no job header
# /NJS: no job summary
# /NP : no progress percentage (cleaner output)
# /XD : exclude directories (match at any level)
# /XF : exclude files (match at any level)

$robocopyArgs = @(
    $sourceDir,
    $destDir,
    "/E",
    "/NJH",
    "/NJS",
    "/NP",
    "/XD", "node_modules", "dist", "target", "gen",
    "/XF", "package-lock.json", "Cargo.lock"
)

Write-Host "Running robocopy..." -ForegroundColor Yellow
$result = & robocopy @robocopyArgs

# Robocopy exit codes 0-7 indicate success (0 = nothing copied, 1 = files copied)
if ($LASTEXITCODE -ge 8) {
    Write-Error "Robocopy failed with exit code: $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Copy complete. Robocopy exit code: $LASTEXITCODE" -ForegroundColor Green
Write-Host "Destination: $destDir" -ForegroundColor Green
