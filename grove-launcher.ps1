# Grove Launcher
# Right-click > Create Shortcut, then set shortcut target to:
# powershell -ExecutionPolicy Bypass -NoExit -File "Z:\data\development\grove\grove-launcher.ps1"
#
# Or double-click Grove.bat

$ErrorActionPreference = "Stop"
$GroveRoot = "Z:\data\development\grove"
if (-not (Test-Path $GroveRoot)) {
    Write-Host ""
    Write-Host "  ERROR: Grove not found at $GroveRoot" -ForegroundColor Red
    Write-Host "  Make sure Z: drive is mapped to \\THE-BATMAN\mnt" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}
Clear-Host
$Branch = git -C $GroveRoot branch --show-current 2>$null
Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host "   GROVE - Worktree Manager" -ForegroundColor White
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host "  Repo:   $GroveRoot" -ForegroundColor DarkGray
Write-Host "  Branch: $Branch" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ----------------------------------------------" -ForegroundColor DarkGray
Write-Host "   1 - Launch Claude Code" -ForegroundColor Yellow
Write-Host "   2 - Launch Claude Code (autonomous)" -ForegroundColor Yellow
Write-Host "   3 - Dev server (cargo tauri dev)" -ForegroundColor Yellow
Write-Host "   4 - Build release (cargo tauri build)" -ForegroundColor Yellow
Write-Host "   q - Quit" -ForegroundColor Yellow
Write-Host ""
$Selection = Read-Host "  Select"
switch ($Selection.ToLower()) {
    'q' { exit 0 }
    '1' {
        Set-Location $GroveRoot
        Write-Host ""
        Write-Host "  Launching Claude Code..." -ForegroundColor Green
        Write-Host ""
        claude --dangerously-skip-permissions
    }
    '2' {
        Set-Location $GroveRoot
        Write-Host ""
        Write-Host "  Launching Claude Code (autonomous)..." -ForegroundColor Green
        Write-Host ""
        claude --dangerously-skip-permissions -p "/gsd:autonomous"
    }
    '3' {
        Set-Location $GroveRoot
        Write-Host ""
        Write-Host "  Starting Tauri dev server..." -ForegroundColor Green
        Write-Host ""
        cargo tauri dev
    }
    '4' {
        Set-Location $GroveRoot
        Write-Host ""
        Write-Host "  Building release..." -ForegroundColor Green
        Write-Host ""
        cargo tauri build
    }
    default {
        Write-Host "  Invalid selection." -ForegroundColor Red
        Start-Sleep 2
    }
}
Write-Host ""
Read-Host "  Press Enter to exit"
