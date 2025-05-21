@echo off
REM ============================================================
REM Price Alert - Quick Start Menu
REM ============================================================
REM This script provides a simple menu interface for common
REM Price Alert operations on Windows
REM Updated to remove PowerShell dependencies

SETLOCAL EnableDelayedExpansion
COLOR 0B
TITLE Price Alert - Quick Start Menu

:MENU
CLS
ECHO.
ECHO [96m============================================================[0m
ECHO [96m                 PRICE ALERT - QUICK START                  [0m
ECHO [96m============================================================[0m
ECHO.
ECHO  [93m1.[0m Setup Environment
ECHO  [93m2.[0m Start Services
ECHO  [93m3.[0m Stop Services
ECHO  [93m4.[0m Start Application (Production Mode)
ECHO  [93m5.[0m Start Application (Development Mode)
ECHO  [93m6.[0m Run Tests
ECHO  [93m7.[0m View Project Information
ECHO  [93m8.[0m View Services Status
ECHO  [93m9.[0m Launch Management Tool
ECHO  [93m0.[0m Exit
ECHO.
ECHO [96m============================================================[0m
ECHO.

SET /P CHOICE="Enter your choice (0-9): "
ECHO.

IF "%CHOICE%"=="1" GOTO SETUP
IF "%CHOICE%"=="2" GOTO START_SERVICES
IF "%CHOICE%"=="3" GOTO STOP_SERVICES
IF "%CHOICE%"=="4" GOTO START_APP
IF "%CHOICE%"=="5" GOTO START_DEV
IF "%CHOICE%"=="6" GOTO RUN_TESTS
IF "%CHOICE%"=="7" GOTO PROJECT_INFO
IF "%CHOICE%"=="8" GOTO SERVICES_STATUS
IF "%CHOICE%"=="9" GOTO MANAGEMENT
IF "%CHOICE%"=="0" GOTO EXIT

ECHO [31mInvalid choice. Please try again.[0m
TIMEOUT /T 2 >nul
GOTO MENU

:SETUP
ECHO [92mSetting up environment...[0m
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" status
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:START_SERVICES
ECHO [92mStarting services...[0m
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" start
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:STOP_SERVICES
ECHO [92mStopping services...[0m
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" stop
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:START_APP
ECHO [92mStarting application in production mode...[0m
ECHO [93m(Press Ctrl+C to stop the application and return to menu)[0m
ECHO.
ECHO [96m============================================================[0m
ECHO [96m          PRICE ALERT - PRODUCTION MODE                     [0m
ECHO [96m============================================================[0m
ECHO.
SET NODE_ENV=production
node "%~dp0index.js"
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:START_DEV
ECHO [92mStarting application in development mode...[0m
ECHO [93m(Press Ctrl+C to stop the application and return to menu)[0m
ECHO.
ECHO [96m============================================================[0m
ECHO [96m          PRICE ALERT - DEVELOPMENT MODE                    [0m
ECHO [96m============================================================[0m
ECHO.
SET NODE_ENV=development
WHERE nodemon >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [93mNodemon not found. Installing nodemon globally...[0m
    CALL npm install -g nodemon
)
nodemon "%~dp0index.js"
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:RUN_TESTS
ECHO [92mRunning tests...[0m
ECHO.
ECHO [96m============================================================[0m
ECHO [96m                RUNNING TEST SUITE                          [0m
ECHO [96m============================================================[0m
ECHO.
npm test
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:PROJECT_INFO
ECHO [92mViewing project information...[0m
ECHO.
ECHO [96m============================================================[0m
ECHO [96m                 PRICE ALERT INFORMATION                    [0m
ECHO [96m============================================================[0m
ECHO.
node "%~dp0cli.js" info
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:SERVICES_STATUS
ECHO [92mChecking services status...[0m
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" status
ECHO.
ECHO [92mPress any key to return to menu...[0m
PAUSE >nul
GOTO MENU

:MANAGEMENT
ECHO [92mLaunching management tool...[0m
CALL "%~dp0price-alert-manage.bat"
GOTO MENU

:EXIT
ECHO [92mExiting Price Alert Quick Start Menu...[0m
TIMEOUT /T 2 >nul
EXIT /B 0
