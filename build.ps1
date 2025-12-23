# WlfRyt Google Calendar - Build Script
# Run this script to build the application for distribution
# Optimized for high-core-count CPUs (Ryzen 9 8940HX - 16 cores / 32 threads)

param(
    [Parameter()]
    [ValidateSet("win", "mac", "linux", "all", "portable")]
    [string]$Platform = "portable",
    
    [Parameter()]
    [int]$Threads = 0  # Auto-detect if 0
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  WlfRyt Google Calendar Build Script  " -ForegroundColor Cyan
Write-Host "  (Multi-threaded Optimized)           " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if npm is installed
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: npm is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "Node.js version: $(node --version)" -ForegroundColor Green
Write-Host "npm version: $(npm --version)" -ForegroundColor Green
Write-Host ""

# Detect CPU cores and configure parallel processing
$CpuCores = (Get-CimInstance Win32_Processor).NumberOfCores
$CpuThreads = (Get-CimInstance Win32_Processor).NumberOfLogicalProcessors

if ($Threads -eq 0) {
    # Use all logical processors (threads) for maximum parallelization
    $Threads = $CpuThreads
}

Write-Host "CPU Optimization:" -ForegroundColor Magenta
Write-Host "  Physical Cores: $CpuCores" -ForegroundColor White
Write-Host "  Logical Threads: $CpuThreads" -ForegroundColor White
Write-Host "  Using Threads: $Threads" -ForegroundColor Green
Write-Host ""

# Set environment variables for parallel processing
$env:UV_THREADPOOL_SIZE = $Threads                    # Node.js libuv thread pool
$env:ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = "true"
$env:npm_config_jobs = $Threads                       # npm parallel jobs
$env:JOBS = $Threads                                  # Generic parallel jobs
$env:MAKEFLAGS = "-j$Threads"                         # Make parallel jobs (for native modules)
$env:CMAKE_BUILD_PARALLEL_LEVEL = $Threads            # CMake parallel builds
$env:NINJA_STATUS = "[%f/%t] "                        # Ninja status format
$env:MAX_CONCURRENCY = $Threads                       # Electron-builder concurrency

# Increase Node.js memory for large builds (use ~75% of typical RAM)
$env:NODE_OPTIONS = "--max-old-space-size=12288"      # 12GB max heap

Write-Host "Environment configured for parallel builds" -ForegroundColor Green
Write-Host ""

# Navigate to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
    Write-Host ""
}

# Clean previous builds
if (Test-Path "dist") {
    Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "dist"
}

# Update version to timestamp
Write-Host "Updating version to timestamp..." -ForegroundColor Yellow
node scripts/update-version.js
$version = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "Version: $version" -ForegroundColor Green
Write-Host ""

# Build based on platform
Write-Host "Building for platform: $Platform" -ForegroundColor Yellow
Write-Host ""

$BuildStartTime = Get-Date

switch ($Platform) {
    "portable" {
        Write-Host "Building Windows portable version..." -ForegroundColor Cyan
        npm run build:portable
    }
    "win" {
        Write-Host "Building Windows installer..." -ForegroundColor Cyan
        npm run build:win
    }
    "mac" {
        Write-Host "Building macOS application..." -ForegroundColor Cyan
        npm run build:mac
    }
    "linux" {
        Write-Host "Building Linux AppImage..." -ForegroundColor Cyan
        npm run build:linux
    }
    "all" {
        Write-Host "Building for all platforms in PARALLEL..." -ForegroundColor Cyan
        Write-Host "Using PowerShell parallel jobs for maximum CPU utilization" -ForegroundColor Magenta
        Write-Host ""
        
        # Build all platforms in parallel using PowerShell jobs
        $ScriptPath = $ScriptDir
        $EnvVars = @{
            UV_THREADPOOL_SIZE = $env:UV_THREADPOOL_SIZE
            npm_config_jobs = $env:npm_config_jobs
            JOBS = $env:JOBS
            MAKEFLAGS = $env:MAKEFLAGS
            CMAKE_BUILD_PARALLEL_LEVEL = $env:CMAKE_BUILD_PARALLEL_LEVEL
            NODE_OPTIONS = $env:NODE_OPTIONS
            MAX_CONCURRENCY = $env:MAX_CONCURRENCY
        }
        
        $Jobs = @()
        
        # Start Windows build job
        $Jobs += Start-Job -Name "Build-Windows" -ScriptBlock {
            param($Path, $Env)
            Set-Location $Path
            $Env.GetEnumerator() | ForEach-Object { Set-Item "env:$($_.Key)" $_.Value }
            & npm run build:win 2>&1
        } -ArgumentList $ScriptPath, $EnvVars
        Write-Host "  [Started] Windows build job" -ForegroundColor Yellow
        
        # Start macOS build job
        $Jobs += Start-Job -Name "Build-macOS" -ScriptBlock {
            param($Path, $Env)
            Set-Location $Path
            $Env.GetEnumerator() | ForEach-Object { Set-Item "env:$($_.Key)" $_.Value }
            & npm run build:mac 2>&1
        } -ArgumentList $ScriptPath, $EnvVars
        Write-Host "  [Started] macOS build job" -ForegroundColor Yellow
        
        # Start Linux build job
        $Jobs += Start-Job -Name "Build-Linux" -ScriptBlock {
            param($Path, $Env)
            Set-Location $Path
            $Env.GetEnumerator() | ForEach-Object { Set-Item "env:$($_.Key)" $_.Value }
            & npm run build:linux 2>&1
        } -ArgumentList $ScriptPath, $EnvVars
        Write-Host "  [Started] Linux build job" -ForegroundColor Yellow
        
        Write-Host ""
        Write-Host "Waiting for all builds to complete..." -ForegroundColor Cyan
        
        # Wait for all jobs and display progress
        $CompletedJobs = @()
        while ($CompletedJobs.Count -lt $Jobs.Count) {
            foreach ($Job in $Jobs) {
                if ($Job.State -eq "Completed" -and $Job.Id -notin $CompletedJobs) {
                    $CompletedJobs += $Job.Id
                    $JobOutput = Receive-Job -Job $Job
                    if ($Job.State -eq "Completed") {
                        Write-Host "  [Completed] $($Job.Name)" -ForegroundColor Green
                    }
                }
                elseif ($Job.State -eq "Failed" -and $Job.Id -notin $CompletedJobs) {
                    $CompletedJobs += $Job.Id
                    Write-Host "  [Failed] $($Job.Name)" -ForegroundColor Red
                    Receive-Job -Job $Job | Write-Host -ForegroundColor Red
                }
            }
            Start-Sleep -Milliseconds 500
        }
        
        # Cleanup jobs
        $Jobs | Remove-Job -Force
        
        Write-Host ""
    }
}

if ($LASTEXITCODE -eq 0) {
    $BuildEndTime = Get-Date
    $BuildDuration = $BuildEndTime - $BuildStartTime
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Build completed successfully!        " -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Build Statistics:" -ForegroundColor Magenta
    Write-Host "  Duration: $($BuildDuration.Minutes)m $($BuildDuration.Seconds)s" -ForegroundColor White
    Write-Host "  Threads Used: $Threads" -ForegroundColor White
    Write-Host ""
    Write-Host "Output files are in the 'dist' folder:" -ForegroundColor Cyan
    
    if (Test-Path "dist") {
        Get-ChildItem "dist" -Recurse -File | Where-Object { $_.Extension -in ".exe", ".dmg", ".AppImage", ".msi" } | ForEach-Object {
            $SizeMB = [math]::Round($_.Length / 1MB, 2)
            Write-Host "  - $($_.Name) ($SizeMB MB)" -ForegroundColor White
        }
    }
} else {
    Write-Host ""
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}
