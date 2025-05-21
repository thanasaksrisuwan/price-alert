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
COLOR 0B
ECHO ============================================================
ECHO                  PRICE ALERT - QUICK START                  
ECHO ============================================================
ECHO.
ECHO  1. Setup Environment
ECHO  2. Start Services
ECHO  3. Stop Services
ECHO  4. Start Application (Production Mode)
ECHO  5. Start Application (Development Mode)
ECHO  6. Run Tests
ECHO  7. View Project Information
ECHO  8. View Services Status
ECHO  9. Launch Management Tool
ECHO  0. Exit
ECHO.
ECHO ============================================================
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

ECHO Invalid choice. Please try again.
TIMEOUT /T 2 >nul
GOTO MENU

:SETUP
ECHO Setting up environment...
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" status
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:START_SERVICES
ECHO Starting services...
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" start
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:STOP_SERVICES
ECHO Stopping services...
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" stop
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:START_APP
ECHO [92mStarting application in production mode...[92m
ECHO [93m(Press Ctrl+C to stop the application and return to menu)[93m
ECHO.
ECHO [96m============================================================[96m
ECHO [96m          PRICE ALERT - PRODUCTION MODE                     [96m
ECHO [96m============================================================[96m
ECHO.
SET NODE_ENV=production
node "%~dp0index.js"
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:START_DEV
ECHO [92mStarting application in development mode...[92m
ECHO [93m(Press Ctrl+C to stop the application and return to menu)[93m
ECHO.
ECHO [96m============================================================[96m
ECHO [96m          PRICE ALERT - DEVELOPMENT MODE                    [96m
ECHO [96m============================================================[96m
ECHO.
SET NODE_ENV=development
WHERE nodemon >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [93mNodemon not found. Installing nodemon globally...[93m
    CALL npm install -g nodemon
)
nodemon "%~dp0index.js"
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:RUN_TESTS
ECHO [92mRunning tests...[92m
ECHO.
ECHO [96m============================================================[96m
ECHO [96m                RUNNING TEST SUITE                          [96m
ECHO [96m============================================================[96m
ECHO.
npm test
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:PROJECT_INFO
ECHO [92mViewing project information...[92m
ECHO.
ECHO [96m============================================================[96m
ECHO [96m                 PRICE ALERT INFORMATION                    [96m
ECHO [96m============================================================[96m
ECHO.
node "%~dp0cli.js" info
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:SERVICES_STATUS
ECHO [92mChecking services status...[92m
ECHO.
CALL "%~dp0portable-env\portable-services.cmd" status
ECHO.
ECHO [92mPress any key to return to menu...[92m
PAUSE >nul
GOTO MENU

:MANAGEMENT
ECHO [92mLaunching management tool...[92m
CALL "%~dp0price-alert-manage.bat"
GOTO MENU

:EXIT
ECHO [92mExiting Price Alert Quick Start Menu...[92m
TIMEOUT /T 2 >nul
EXIT /B 0
