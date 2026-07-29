# =============================================================================
#  deploy_vps.ps1  —  ISF Psycho-Analysis Portal — VPS Setup Script
#  Run this script ON THE VPS as Administrator (PowerShell)
#
#  Usage:
#    1. Copy the entire project folder to the VPS (see instructions below)
#    2. Open PowerShell as Administrator
#    3. Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#    4. .\deploy_vps.ps1
# =============================================================================

param(
    # Absolute path where the project lives on the VPS.
    # Change this to wherever you copy the project on the VPS.
    [string]$ProjectRoot = "C:\inetpub\isf-portal",

    # The hostname or IP your VPS exposes (used for CORS + IIS binding).
    [string]$ServerHost  = "localhost",

    # IIS site name
    [string]$SiteName    = "ISF-Portal",

    # Port IIS will listen on (80 for HTTP, 443 needs a cert)
    [int]$IISPort        = 80,

    # Port Uvicorn will listen on (internal only)
    [int]$APIPort        = 8000,

    # Windows service name for the FastAPI backend
    [string]$ServiceName = "ISF-API"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) {
    Write-Host "`n━━━  $msg  ━━━" -ForegroundColor Cyan
}
function Write-Ok([string]$msg)   { Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg)  { Write-Host "  ✖  $msg" -ForegroundColor Red }

# ─── Require Administrator ────────────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "Please run this script as Administrator."
    exit 1
}

$DistPath    = Join-Path $ProjectRoot "frontend\dist"
$VenvPython  = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$VenvUvicorn = Join-Path $ProjectRoot ".venv\Scripts\uvicorn.exe"
$NSSMPath    = "C:\nssm\nssm.exe"
$EnvFile     = Join-Path $ProjectRoot ".env"

# =============================================================================
# STEP 1 — Verify project folder
# =============================================================================
Write-Step "Step 1/7 — Verifying project folder"

if (-not (Test-Path $ProjectRoot)) {
    Write-Err "Project root not found: $ProjectRoot"
    Write-Warn "Copy your project to $ProjectRoot and re-run this script."
    exit 1
}
if (-not (Test-Path $DistPath)) {
    Write-Err "frontend\dist not found. Run 'npm run build' first (locally) and re-copy."
    exit 1
}
if (-not (Test-Path $EnvFile)) {
    Write-Err ".env not found at $EnvFile — copy .env.example → .env and fill in your credentials."
    exit 1
}
Write-Ok "Project folder OK: $ProjectRoot"
Write-Ok "Frontend dist OK: $DistPath"
Write-Ok ".env file found"

# =============================================================================
# STEP 2 — Enable IIS features
# =============================================================================
Write-Step "Step 2/7 — Enabling IIS Windows features"

$features = @(
    "IIS-WebServerRole",
    "IIS-WebServer",
    "IIS-StaticContent",
    "IIS-DefaultDocument",
    "IIS-HttpErrors",
    "IIS-HttpCompressionStatic",
    "IIS-HttpCompressionDynamic",
    "IIS-Security",
    "IIS-RequestFiltering"
)

foreach ($f in $features) {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $f).State
    if ($state -eq "Enabled") {
        Write-Ok "$f already enabled"
    } else {
        Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart | Out-Null
        Write-Ok "$f enabled"
    }
}

# =============================================================================
# STEP 3 — Check URL Rewrite + ARR (must be installed manually)
# =============================================================================
Write-Step "Step 3/7 — Checking URL Rewrite and ARR modules"

$rewriteDll = "C:\Windows\System32\inetsrv\rewrite.dll"
$arrDll     = "C:\Windows\System32\inetsrv\arr.dll"
$missing    = @()

if (-not (Test-Path $rewriteDll)) { $missing += "URL Rewrite 2.1" }
if (-not (Test-Path $arrDll))     { $missing += "Application Request Routing (ARR) 3.0" }

if ($missing.Count -gt 0) {
    Write-Warn "The following IIS modules are MISSING and must be installed manually:"
    foreach ($m in $missing) { Write-Warn "  → $m  (download from https://www.iis.net/downloads/microsoft)" }
    Write-Warn "Install them, then re-run this script."
    # Don't exit — let the rest of the setup continue so the user only needs one re-run
} else {
    Write-Ok "URL Rewrite module found"
    Write-Ok "ARR module found"

    # Enable ARR proxy via appcmd
    & "$env:windir\system32\inetsrv\appcmd.exe" set config `
        -section:system.webServer/proxy /enabled:true /commit:apphost 2>&1 | Out-Null
    Write-Ok "ARR proxy enabled"
}

# =============================================================================
# STEP 4 — Install Python venv dependencies
# =============================================================================
Write-Step "Step 4/7 — Installing Python dependencies"

if (-not (Test-Path $VenvPython)) {
    Write-Warn "Virtual environment not found at .venv\"
    Write-Warn "Creating it now (requires Python 3.11+ in PATH)..."
    $python = (Get-Command python -ErrorAction SilentlyContinue)?.Source
    if (-not $python) {
        Write-Err "Python not found in PATH. Install Python 3.11+ and re-run."
        exit 1
    }
    & $python -m venv "$ProjectRoot\.venv"
    Write-Ok ".venv created"
}

& $VenvPython -m pip install --upgrade pip --quiet
& $VenvPython -m pip install -r "$ProjectRoot\requirements.txt" -r "$ProjectRoot\requirements-api.txt" --quiet
Write-Ok "Python dependencies installed"

# =============================================================================
# STEP 5 — Install NSSM + register Windows Service
# =============================================================================
Write-Step "Step 5/7 — Setting up Uvicorn Windows Service"

if (-not (Test-Path $NSSMPath)) {
    Write-Warn "NSSM not found at $NSSMPath"
    Write-Warn "Download NSSM from https://nssm.cc/download, extract nssm.exe to C:\nssm\, then re-run."
    Write-Warn "Skipping service setup..."
} else {
    # Remove existing service if present
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Warn "Service '$ServiceName' already exists — removing and re-creating..."
        & $NSSMPath stop    $ServiceName 2>&1 | Out-Null
        & $NSSMPath remove  $ServiceName confirm 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }

    # Install service
    & $NSSMPath install $ServiceName $VenvUvicorn
    & $NSSMPath set     $ServiceName AppParameters  "api:app --host 127.0.0.1 --port $APIPort"
    & $NSSMPath set     $ServiceName AppDirectory   $ProjectRoot
    & $NSSMPath set     $ServiceName DisplayName    "ISF Psycho-Analysis API"
    & $NSSMPath set     $ServiceName Description    "FastAPI + Uvicorn backend for the ISF portal"
    & $NSSMPath set     $ServiceName Start          SERVICE_AUTO_START

    # Pass environment variables from .env file to the service
    $envContent = Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#]" -and $_ -match "=" }
    $envString  = ($envContent -join "`n")
    & $NSSMPath set $ServiceName AppEnvironmentExtra $envString

    # Log files
    $logDir = Join-Path $ProjectRoot "logs"
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    & $NSSMPath set $ServiceName AppStdout (Join-Path $logDir "uvicorn_stdout.log")
    & $NSSMPath set $ServiceName AppStderr (Join-Path $logDir "uvicorn_stderr.log")
    & $NSSMPath set $ServiceName AppRotateFiles 1
    & $NSSMPath set $ServiceName AppRotateOnline 1
    & $NSSMPath set $ServiceName AppRotateBytes 10485760  # 10 MB

    # Start the service
    & $NSSMPath start $ServiceName
    Start-Sleep -Seconds 3

    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-Ok "Service '$ServiceName' is running"
    } else {
        Write-Warn "Service may not have started. Check: C:\inetpub\isf-portal\logs\uvicorn_stderr.log"
    }
}

# =============================================================================
# STEP 6 — Create / update IIS Site
# =============================================================================
Write-Step "Step 6/7 — Configuring IIS Site"

Import-Module WebAdministration -ErrorAction SilentlyContinue

$existingSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($existingSite) {
    Write-Warn "IIS site '$SiteName' already exists — updating physical path..."
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $DistPath
} else {
    New-Website -Name $SiteName `
                -PhysicalPath $DistPath `
                -Port $IISPort `
                -Force | Out-Null
    Write-Ok "IIS site '$SiteName' created on port $IISPort"
}

# Make sure the app pool identity has read access to dist/
$acl = Get-Acl $DistPath
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "IIS AppPool\$SiteName", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($rule)
Set-Acl $DistPath $acl
Write-Ok "IIS AppPool read permissions set on dist/"

# Start the site
Start-Website -Name $SiteName -ErrorAction SilentlyContinue
Write-Ok "IIS site started"

# =============================================================================
# STEP 7 — Verify
# =============================================================================
Write-Step "Step 7/7 — Verifying deployment"

Start-Sleep -Seconds 2

try {
    $apiResp = Invoke-WebRequest "http://127.0.0.1:$APIPort/api/ping" -TimeoutSec 5 -UseBasicParsing
    if ($apiResp.StatusCode -eq 200) {
        Write-Ok "Backend API responding at http://127.0.0.1:$APIPort/api/ping"
    } else {
        Write-Warn "Backend returned HTTP $($apiResp.StatusCode)"
    }
} catch {
    Write-Warn "Backend not responding yet — check logs at $ProjectRoot\logs\uvicorn_stderr.log"
}

try {
    $webResp = Invoke-WebRequest "http://localhost:$IISPort/" -TimeoutSec 5 -UseBasicParsing
    if ($webResp.StatusCode -eq 200) {
        Write-Ok "Frontend responding at http://localhost:$IISPort/"
    } else {
        Write-Warn "IIS returned HTTP $($webResp.StatusCode)"
    }
} catch {
    Write-Warn "IIS site not responding — check IIS Manager"
}

# =============================================================================
# Summary
# =============================================================================
Write-Host "`n" + ("═" * 60) -ForegroundColor Cyan
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Cyan
Write-Host "═" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend :  http://$ServerHost" -ForegroundColor White
Write-Host "  API      :  http://$ServerHost/api/*  (proxied to :$APIPort)" -ForegroundColor White
Write-Host ""
Write-Host "  Service logs : $ProjectRoot\logs\" -ForegroundColor Gray
Write-Host "  Restart API  : Restart-Service $ServiceName" -ForegroundColor Gray
Write-Host "  Stop API     : Stop-Service $ServiceName" -ForegroundColor Gray
Write-Host ""
