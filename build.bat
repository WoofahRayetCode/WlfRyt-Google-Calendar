@echo off
REM WlfRyt Google Calendar - Build Script (Windows Batch)
REM Run this script to build the application for distribution
REM Optimized for high-core-count CPUs (Ryzen 9 8940HX - 16 cores / 32 threads)

setlocal enabledelayedexpansion

echo ========================================
echo   WlfRyt Google Calendar Build Script
echo   (Multi-threaded Optimized)
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js first.
    exit /b 1
)

REM Show versions
for /f "tokens=*" %%i in ('node --version') do echo Node.js version: %%i
for /f "tokens=*" %%i in ('npm --version') do echo npm version: %%i
echo.

REM Detect CPU threads using WMIC
for /f "tokens=2 delims==" %%i in ('wmic cpu get NumberOfLogicalProcessors /value 2^>nul ^| find "="') do set CPU_THREADS=%%i
if not defined CPU_THREADS set CPU_THREADS=8

echo CPU Optimization:
echo   Logical Threads: %CPU_THREADS%
echo   Using Threads: %CPU_THREADS%
echo.

REM Set environment variables for parallel processing
set UV_THREADPOOL_SIZE=%CPU_THREADS%
set npm_config_jobs=%CPU_THREADS%
set JOBS=%CPU_THREADS%
set MAKEFLAGS=-j%CPU_THREADS%
set CMAKE_BUILD_PARALLEL_LEVEL=%CPU_THREADS%
set MAX_CONCURRENCY=%CPU_THREADS%
set NODE_OPTIONS=--max-old-space-size=12288
set ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES=true

echo Environment configured for parallel builds
echo.

REM Navigate to script directory
cd /d "%~dp0"

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install dependencies
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

REM Clean previous builds
if exist "dist" (
    echo Cleaning previous builds...
    rmdir /s /q "dist"
)

REM Build Windows installer
echo Building Windows installer...
echo.
call npm run build:win

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================
    echo   Build completed successfully!
    echo ========================================
    echo.
    echo Output files are in the 'dist' folder.
    if exist "dist" (
        dir /b "dist\*.exe" 2>nul
    )
) else (
    echo.
    echo ERROR: Build failed!
    exit /b 1
)

pause
