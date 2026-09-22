@echo off
title Schedule System - First Run Setup
cd /d "%~dp0"

echo ========================================
echo   Schedule System - First Run Setup
echo ========================================

REM ---------- 1. Python ----------
echo.
echo [1/4] Check Python...
set PY_CMD=
py -3 --version >nul 2>&1
if not errorlevel 1 set PY_CMD=py -3
python --version >nul 2>&1
if not errorlevel 1 if "%PY_CMD%"=="" set PY_CMD=python
if "%PY_CMD%"=="" goto :no_python
echo   Found:
%PY_CMD% --version
goto :python_ok

:no_python
echo.
echo [ERROR] Python 3 not found. Install Python 3.10+:
echo   https://www.python.org/downloads/
echo   China mirror: https://registry.npmmirror.com/binary.html?path=python/
echo.
echo   IMPORTANT: check "Add python.exe to PATH" during install,
echo   then close this window and run this script again.
pause
exit /b 1

:python_ok
REM ---------- 2. Node.js ----------
echo.
echo [2/4] Check Node.js...
node --version >nul 2>&1
if errorlevel 1 goto :no_node
call npm --version >nul 2>&1
if errorlevel 1 goto :no_node
echo   Found:
node --version
call npm --version
goto :node_ok

:no_node
echo.
echo [ERROR] Node.js or npm not found. Install Node.js 18+ LTS:
echo   https://nodejs.org/en/download/
echo   China mirror: https://npmmirror.com/mirrors/node/
echo.
echo   Close this window and run this script again after install.
pause
exit /b 1

:node_ok
REM ---------- 3. China mirrors ----------
echo.
echo [3/4] Set China mirrors for faster downloads...
echo   pip mirror: Tsinghua PyPI
%PY_CMD% -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1
echo   npm mirror: npmmirror
call npm config set registry https://registry.npmmirror.com >nul 2>&1
echo   Mirror config done, current user only

REM ---------- 4. Install and build ----------
echo.
echo [4/4] Install dependencies and build frontend...
if not exist ".venv\Scripts\python.exe" (
    echo   Creating virtual env...
    %PY_CMD% -m venv .venv
    if errorlevel 1 goto :fail
)
echo   Installing backend dependencies...
".venv\Scripts\pip.exe" install -r backend\requirements.txt --quiet
if errorlevel 1 goto :fail
echo   Backend dependencies OK

cd frontend
if not exist "node_modules" (
    echo   Installing frontend dependencies, first time may be slow...
    call npm install --silent
    if errorlevel 1 goto :fail_frontend
)
echo   Building frontend...
call npm run build
if errorlevel 1 goto :fail_frontend
cd ..
echo   Frontend build OK

echo.
echo ========================================
echo   Environment ready. Starting the system...
echo ========================================

REM Call the other bat in this folder (the launcher), skipping itself.
for %%B in ("%~dp0*.bat") do (
    if /i not "%%~nxB"=="%~nx0" call "%%~fB"
)

echo.
echo   System exited. Press any key to close.
pause
exit /b %errorlevel%

:fail_frontend
cd ..
:fail
echo.
echo [ERROR] Install or build failed. Check the messages above.
pause
exit /b 1
