@echo off
title Schedule System - Launcher
cd /d "%~dp0"

echo ========================================
echo   Schedule System - One-click Start
echo ========================================

REM 1. Kill process on port 8020
echo [1/5] Check port 8020...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":8020 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
    echo   Stopped old process PID=%%a
)

REM 2. Backend environment
echo [2/5] Prepare backend environment...
if exist ".venv\Scripts\python.exe" goto :venv_ready
echo   Creating virtual env...
set PY_CMD=
py -3 --version >nul 2>&1
if not errorlevel 1 set PY_CMD=py -3
python --version >nul 2>&1
if not errorlevel 1 if "%PY_CMD%"=="" set PY_CMD=python
if "%PY_CMD%"=="" goto :no_python
%PY_CMD% -m venv .venv
if errorlevel 1 goto :venv_fail

:venv_ready
echo   Installing backend dependencies...
".venv\Scripts\pip.exe" install -r backend\requirements.txt --quiet
if errorlevel 1 goto :pip_fail
echo   Backend dependencies ready

REM 3. Database
echo [3/5] Check database...
if not exist "data\schedule.db" (
    echo   Database not found, will create on startup.
) else (
    echo   Database exists
)

REM 4. Frontend build
echo [4/5] Build frontend...
if exist "frontend\package.json" (
    cd frontend
    if not exist "node_modules" (
        echo   Installing frontend dependencies, first time may take a while...
        call npm install --silent
    )
    echo   Building...
    call npm run build
    if errorlevel 1 (
        echo   Frontend build FAILED! Check the error above.
        pause
        exit /b 1
    )
    cd ..
    echo   Frontend build done
) else (
    echo   Frontend project not found, skip build
)

REM 5. Start service
echo [5/5] Starting service...
echo.
start "" http://localhost:8020
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8020

pause
exit /b %errorlevel%

:no_python
echo.
echo [ERROR] Python 3 not found. Install Python 3.10+ or run the first-run setup bat first.
pause
exit /b 1

:venv_fail
echo.
echo [ERROR] Failed to create virtual env. Check the messages above.
pause
exit /b 1

:pip_fail
echo.
echo [ERROR] Backend dependencies install failed. Check the messages above.
pause
exit /b 1
