# =============================================================================
#  update_vps.ps1  —  ISF Portal — Quick re-deploy after code changes
#
#  Run this on the VPS whenever you push an update:
#    .\update_vps.ps1
#
#  What it does:
#    1. Pulls latest code via git (if repo is on VPS)
#    2. Restarts the FastAPI Windows service
# =============================================================================

param(
    [string]$ProjectRoot = "C:\inetpub\isf-portal",
    [string]$ServiceName = "ISF-API"
)

function Write-Step([string]$msg) { Write-Host "`n━━━  $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  ⚠  $msg" -ForegroundColor Yellow }

Set-Location $ProjectRoot

# ─── Git pull (optional — skip if you copy files manually) ────────────────────
Write-Step "Pulling latest code"
$gitAvailable = Get-Command git -ErrorAction SilentlyContinue
if ($gitAvailable) {
    git pull
    Write-Ok "git pull complete"
} else {
    Write-Warn "git not found — skipping pull. Copy updated files manually."
}

# ─── Rebuild frontend ─────────────────────────────────────────────────────────
Write-Step "Rebuilding frontend"
$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
    Set-Location "$ProjectRoot\frontend"
    npm run build
    Write-Ok "Frontend rebuilt → frontend\dist\"
    Set-Location $ProjectRoot
} else {
    Write-Warn "npm not found on VPS. Build locally and recopy frontend\dist\ to VPS."
}

# ─── Update Python dependencies ───────────────────────────────────────────────
Write-Step "Updating Python dependencies"
& "$ProjectRoot\.venv\Scripts\python.exe" -m pip install `
    -r "$ProjectRoot\requirements.txt" `
    -r "$ProjectRoot\requirements-api.txt" --quiet
Write-Ok "Python dependencies up to date"

# ─── Restart backend service ──────────────────────────────────────────────────
Write-Step "Restarting $ServiceName service"
Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName
Write-Ok "Service status: $($svc.Status)"

Write-Host "`n  Done! Portal is live." -ForegroundColor Cyan
