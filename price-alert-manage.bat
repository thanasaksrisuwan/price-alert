@echo off
REM ============================================================
REM Price Alert Management Tool
REM ============================================================
REM This script provides comprehensive management functionality
REM for the Price Alert application on Windows
REM It replaces multiple PowerShell scripts with a single batch solution

SETLOCAL EnableDelayedExpansion
COLOR 0B
TITLE Price Alert Management Tool

REM Set important paths and constants
SET "ROOT_DIR=%~dp0"
SET "PORTABLE_DIR=%ROOT_DIR%portable-env"
SET "REDIS_DIR=%PORTABLE_DIR%\redis"
SET "PGSQL_DIR=%PORTABLE_DIR%\pgsql"
SET "PGSQL_BIN_DIR=%PGSQL_DIR%\pgsql\bin"
SET "DATA_DIR=%PGSQL_DIR%\data"
SET "PID_DIR=%PORTABLE_DIR%\pids"
SET "LOG_DIR=%PORTABLE_DIR%\logs"
SET "PG_DB_NAME=price_alert_db"
SET "PG_USER=postgres"
SET "PG_PASSWORD=postgres"
SET "PORTABLE_REDIS_PORT=6380"
SET "PORTABLE_PG_PORT=5433"

REM Include color utility functions
IF EXIST "%ROOT_DIR%price-alert-utils.cmd" (
  CALL "%ROOT_DIR%price-alert-utils.cmd"
)

REM ============================================================
REM Main Menu Function
REM ============================================================
:MAIN_MENU
CLS
ECHO.
CALL :HEADER "PRICE ALERT MANAGEMENT TOOL"
ECHO.
ECHO  [93m1.[93m Setup Environment
ECHO  [93m2.[93m Start Services
ECHO  [93m3.[93m Stop Services
ECHO  [93m4.[93m Start Application (Production Mode)
ECHO  [93m5.[93m Start Application (Development Mode)
ECHO  [93m6.[93m Run Tests
ECHO  [93m7.[93m View Services Status
ECHO  [93m8.[93m Clean Up Repository
ECHO  [93m9.[93m Exit
ECHO.
CALL :DIVIDER
ECHO.

SET /P MENU_CHOICE="Please enter your choice (1-9): "

IF "%MENU_CHOICE%"=="1" GOTO SETUP_ENV
IF "%MENU_CHOICE%"=="2" GOTO START_SERVICES
IF "%MENU_CHOICE%"=="3" GOTO STOP_SERVICES
IF "%MENU_CHOICE%"=="4" GOTO START_PROD
IF "%MENU_CHOICE%"=="5" GOTO START_DEV
IF "%MENU_CHOICE%"=="6" GOTO RUN_TESTS
IF "%MENU_CHOICE%"=="7" GOTO VIEW_STATUS
IF "%MENU_CHOICE%"=="8" GOTO CLEANUP_REPO
IF "%MENU_CHOICE%"=="9" GOTO EXIT
GOTO MAIN_MENU

REM ============================================================
REM Setup Environment
REM ============================================================
:SETUP_ENV
CLS
CALL :HEADER "SETUP ENVIRONMENT"
ECHO.
ECHO [93m1.[93m Download and setup portable environment
ECHO [93m2.[93m Check/install Node.js dependencies 
ECHO [93m3.[93m Return to main menu
ECHO.
SET /P SETUP_CHOICE="Please enter your choice (1-3): "

IF "%SETUP_CHOICE%"=="1" GOTO DOWNLOAD_PORTABLE
IF "%SETUP_CHOICE%"=="2" GOTO INSTALL_DEPENDENCIES
IF "%SETUP_CHOICE%"=="3" GOTO MAIN_MENU
GOTO SETUP_ENV

:DOWNLOAD_PORTABLE
ECHO.
CALL :INFO "Setting up portable environment..."
ECHO.

REM Create required directories
IF NOT EXIST "%PORTABLE_DIR%" mkdir "%PORTABLE_DIR%"
IF NOT EXIST "%PID_DIR%" mkdir "%PID_DIR%"
IF NOT EXIST "%LOG_DIR%" mkdir "%LOG_DIR%"

CALL :WARNING "Downloading portable binaries..."
ECHO.

REM Run the Node.js script for downloading binaries
node "%ROOT_DIR%scripts\portable-env.js"
IF %ERRORLEVEL% NEQ 0 (
    CALL :ERROR "Failed to download portable binaries. Please check your internet connection."
    PAUSE
    GOTO SETUP_ENV
)

ECHO.
CALL :SUCCESS "Portable environment setup complete!"
PAUSE
GOTO SETUP_ENV

:INSTALL_DEPENDENCIES
ECHO.
ECHO [96mInstalling Node.js dependencies...[0m
ECHO.

REM Check if Node.js is installed
WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [91mNode.js is not installed. Please install Node.js first.[0m
    PAUSE
    GOTO SETUP_ENV
)

REM Install npm dependencies
ECHO [93mRunning npm install...[0m
CALL npm install
IF %ERRORLEVEL% NEQ 0 (
    ECHO [91mFailed to install dependencies.[0m
    PAUSE
    GOTO SETUP_ENV
)

ECHO.
ECHO [92mDependencies installed successfully![0m
PAUSE
GOTO SETUP_ENV

REM ============================================================
REM Start Services
REM ============================================================
:START_SERVICES
CLS
ECHO [96m============================================================[0m
ECHO [96m                   STARTING SERVICES                        [0m
ECHO [96m============================================================[0m
ECHO.

REM Check if portable environment exists
IF NOT EXIST "%REDIS_DIR%\redis-server.exe" (
    ECHO [91mPortable environment not found. Please set up the environment first.[0m
    PAUSE
    GOTO MAIN_MENU
)

REM Start PostgreSQL
ECHO [93mStarting PostgreSQL...[0m
SET PGPORT=%PORTABLE_PG_PORT%
SET PGDATA=%DATA_DIR%

REM Check if PostgreSQL is already running
TASKLIST /FI "IMAGENAME eq postgres.exe" 2>NUL | FIND /I /N "postgres.exe" >NUL
IF NOT ERRORLEVEL 1 (
    ECHO [93mPostgreSQL is already running.[0m
) ELSE (
    REM If this is the first time, initialize the database
    IF NOT EXIST "%DATA_DIR%\PG_VERSION" (
        ECHO [93mInitializing PostgreSQL database...[0m
        "%PGSQL_BIN_DIR%\initdb.exe" -D "%DATA_DIR%" -E UTF8 --locale=C -U %PG_USER%
    )
    
    REM Start PostgreSQL server
    START /B "" "%PGSQL_BIN_DIR%\pg_ctl.exe" -D "%DATA_DIR%" -l "%LOG_DIR%\postgres.log" start
    
    REM Wait for PostgreSQL to start
    ECHO [93mWaiting for PostgreSQL to start...[0m
    TIMEOUT /T 5 /NOBREAK >NUL
    
    REM Create database if it doesn't exist
    "%PGSQL_BIN_DIR%\psql.exe" -p %PORTABLE_PG_PORT% -U %PG_USER% -c "SELECT 1 FROM pg_database WHERE datname='%PG_DB_NAME%'" | FIND "1" >NUL
    IF ERRORLEVEL 1 (
        ECHO [93mCreating database %PG_DB_NAME%...[0m
        "%PGSQL_BIN_DIR%\createdb.exe" -p %PORTABLE_PG_PORT% -U %PG_USER% %PG_DB_NAME%
        
        REM Import schema if available
        IF EXIST "%ROOT_DIR%sql\init.sql" (
            ECHO [93mImporting database schema...[0m
            "%PGSQL_BIN_DIR%\psql.exe" -p %PORTABLE_PG_PORT% -U %PG_USER% -d %PG_DB_NAME% -f "%ROOT_DIR%sql\init.sql"
        )
    )
)

REM Start Redis
ECHO [93mStarting Redis...[0m
TASKLIST /FI "IMAGENAME eq redis-server.exe" 2>NUL | FIND /I /N "redis-server.exe" >NUL
IF NOT ERRORLEVEL 1 (
    ECHO [93mRedis is already running.[0m
) ELSE (
    START /B "" "%REDIS_DIR%\redis-server.exe" "%REDIS_DIR%\redis.portable.conf" --port %PORTABLE_REDIS_PORT% --logfile "%LOG_DIR%\redis_portable.log"
    ECHO [93mWaiting for Redis to start...[0m
    TIMEOUT /T 3 /NOBREAK >NUL
)

ECHO.
ECHO [92mServices started successfully![0m
ECHO [92mPostgreSQL running on port %PORTABLE_PG_PORT%[0m
ECHO [92mRedis running on port %PORTABLE_REDIS_PORT%[0m
ECHO.
PAUSE
GOTO MAIN_MENU

REM ============================================================
REM Stop Services
REM ============================================================
:STOP_SERVICES
CLS
ECHO [96m============================================================[0m
ECHO [96m                   STOPPING SERVICES                        [0m
ECHO [96m============================================================[0m
ECHO.

REM Stop PostgreSQL
ECHO [93mStopping PostgreSQL...[0m
SET PGPORT=%PORTABLE_PG_PORT%
SET PGDATA=%DATA_DIR%

TASKLIST /FI "IMAGENAME eq postgres.exe" 2>NUL | FIND /I /N "postgres.exe" >NUL
IF NOT ERRORLEVEL 1 (
    "%PGSQL_BIN_DIR%\pg_ctl.exe" -D "%DATA_DIR%" stop
) ELSE (
    ECHO [93mPostgreSQL is not running.[0m
)

REM Stop Redis
ECHO [93mStopping Redis...[0m
TASKLIST /FI "IMAGENAME eq redis-server.exe" 2>NUL | FIND /I /N "redis-server.exe" >NUL
IF NOT ERRORLEVEL 1 (
    "%REDIS_DIR%\redis-cli.exe" -p %PORTABLE_REDIS_PORT% shutdown
) ELSE (
    ECHO [93mRedis is not running.[0m
)

ECHO.
ECHO [92mAll services stopped.[0m
PAUSE
GOTO MAIN_MENU

REM ============================================================
REM Start Application (Production Mode)
REM ============================================================
:START_PROD
CLS
ECHO [96m============================================================[0m
ECHO [96m             STARTING APP IN PRODUCTION MODE                [0m
ECHO [96m============================================================[0m
ECHO.

REM Check if Node.js is installed
WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [91mNode.js is not installed. Please install Node.js first.[0m
    PAUSE
    GOTO MAIN_MENU
)

ECHO [93mStarting the application in production mode...[0m
ECHO [93mPress Ctrl+C to stop the application.[0m
ECHO.

REM Set NODE_ENV to production
SET NODE_ENV=production

REM Start the application
node "%ROOT_DIR%index.js"

PAUSE
GOTO MAIN_MENU

REM ============================================================
REM Start Application (Development Mode)
REM ============================================================
:START_DEV
CLS
ECHO [96m============================================================[0m
ECHO [96m             STARTING APP IN DEVELOPMENT MODE               [0m
ECHO [96m============================================================[0m
ECHO.

REM Check if Node.js is installed
WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [91mNode.js is not installed. Please install Node.js first.[0m
    PAUSE
    GOTO MAIN_MENU
)

REM Check if nodemon is installed
CALL npm list -g nodemon >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [93mNodemon not found. Installing nodemon globally...[0m
    CALL npm install -g nodemon
)

ECHO [93mStarting the application in development mode with nodemon...[0m
ECHO [93mPress Ctrl+C to stop the application.[0m
ECHO.

REM Set NODE_ENV to development
SET NODE_ENV=development

REM Start the application with nodemon
nodemon "%ROOT_DIR%index.js"

PAUSE
GOTO MAIN_MENU

REM ============================================================
REM Run Tests
REM ============================================================
:RUN_TESTS
CLS
ECHO [96m============================================================[0m
ECHO [96m                      RUNNING TESTS                         [0m
ECHO [96m============================================================[0m
ECHO.

REM Check if Node.js is installed
WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [91mNode.js is not installed. Please install Node.js first.[0m
    PAUSE
    GOTO MAIN_MENU
)

ECHO [93m1.[0m Run all tests
ECHO [93m2.[0m Run controller tests
ECHO [93m3.[0m Run service tests
ECHO [93m4.[0m Return to main menu
ECHO.
SET /P TEST_CHOICE="Please enter your choice (1-4): "

IF "%TEST_CHOICE%"=="1" (
    ECHO.
    ECHO [93mRunning all tests...[0m
    CALL npm test
)
IF "%TEST_CHOICE%"=="2" (
    ECHO.
    ECHO [93mRunning controller tests...[0m
    CALL npm test -- __tests__/controllers
)
IF "%TEST_CHOICE%"=="3" (
    ECHO.
    ECHO [93mRunning service tests...[0m
    CALL npm test -- __tests__/services
)
IF "%TEST_CHOICE%"=="4" GOTO MAIN_MENU

PAUSE
GOTO RUN_TESTS

REM ============================================================
REM View Service Status
REM ============================================================
:VIEW_STATUS
CLS
ECHO [96m============================================================[0m
ECHO [96m                     SERVICES STATUS                        [0m
ECHO [96m============================================================[0m
ECHO.

REM Check PostgreSQL status
ECHO [96mChecking PostgreSQL status...[0m
TASKLIST /FI "IMAGENAME eq postgres.exe" 2>NUL | FIND /I /N "postgres.exe" >NUL
IF NOT ERRORLEVEL 1 (
    ECHO [92mPostgreSQL: RUNNING (Port %PORTABLE_PG_PORT%)[0m
) ELSE (
    ECHO [91mPostgreSQL: NOT RUNNING[0m
)

REM Check Redis status
ECHO [96mChecking Redis status...[0m
TASKLIST /FI "IMAGENAME eq redis-server.exe" 2>NUL | FIND /I /N "redis-server.exe" >NUL
IF NOT ERRORLEVEL 1 (
    ECHO [92mRedis: RUNNING (Port %PORTABLE_REDIS_PORT%)[0m
) ELSE (
    ECHO [91mRedis: NOT RUNNING[0m
)

REM Check Node.js application status
ECHO [96mChecking Node.js application status...[0m
TASKLIST /FI "IMAGENAME eq node.exe" 2>NUL | FIND /I /N "node.exe" >NUL
IF NOT ERRORLEVEL 1 (
    ECHO [92mNode.js application: RUNNING[0m
) ELSE (
    ECHO [91mNode.js application: NOT RUNNING[0m
)

ECHO.
ECHO [96m============================================================[0m
ECHO.
PAUSE
GOTO MAIN_MENU

REM ============================================================
REM Clean Up Repository
REM ============================================================
:CLEANUP_REPO
CLS
ECHO [96m============================================================[0m
ECHO [96m                  REPOSITORY CLEANUP                        [0m
ECHO [96m============================================================[0m
ECHO.

ECHO [93m1.[0m Clean node_modules and reinstall
ECHO [93m2.[0m Clean logs
ECHO [93m3.[0m Analyze repository size
ECHO [93m4.[0m Return to main menu
ECHO.
SET /P CLEAN_CHOICE="Please enter your choice (1-4): "

IF "%CLEAN_CHOICE%"=="1" (
    ECHO.
    ECHO [93mCleaning node_modules...[0m
    RMDIR /S /Q "%ROOT_DIR%node_modules"
    
    ECHO [93mReinstalling dependencies...[0m
    CALL npm install
    
    ECHO [92mCleanup completed![0m
)
IF "%CLEAN_CHOICE%"=="2" (
    ECHO.
    ECHO [93mCleaning log files...[0m
    DEL /Q "%ROOT_DIR%logs\*.log"
    DEL /Q "%LOG_DIR%\*.log"
    
    ECHO [92mLog files cleaned![0m
)
IF "%CLEAN_CHOICE%"=="3" (
    ECHO.
    ECHO [93mAnalyzing repository size...[0m
    ECHO.
    
    ECHO [96mRepository Size Analysis:[0m
    ECHO [96m-------------------------[0m
    
    FOR /F "tokens=3" %%A IN ('DIR /S /A /-C "%ROOT_DIR%" ^| FINDSTR /C:"File(s)"') DO SET TOTAL_SIZE=%%A
    ECHO Total repository size: %TOTAL_SIZE% bytes
    
    FOR /F "tokens=3" %%A IN ('DIR /S /A /-C "%ROOT_DIR%node_modules" 2^>NUL ^| FINDSTR /C:"File(s)"') DO SET NODE_MODULES_SIZE=%%A
    IF DEFINED NODE_MODULES_SIZE (
        ECHO node_modules size: %NODE_MODULES_SIZE% bytes
    ) ELSE (
        ECHO node_modules size: 0 bytes
    )
    
    FOR /F "tokens=3" %%A IN ('DIR /S /A /-C "%ROOT_DIR%logs" 2^>NUL ^| FINDSTR /C:"File(s)"') DO SET LOGS_SIZE=%%A
    IF DEFINED LOGS_SIZE (
        ECHO logs size: %LOGS_SIZE% bytes
    ) ELSE (
        ECHO logs size: 0 bytes
    )
    
    FOR /F "tokens=3" %%A IN ('DIR /S /A /-C "%PORTABLE_DIR%" 2^>NUL ^| FINDSTR /C:"File(s)"') DO SET PORTABLE_SIZE=%%A
    IF DEFINED PORTABLE_SIZE (
        ECHO portable-env size: %PORTABLE_SIZE% bytes
    ) ELSE (
        ECHO portable-env size: 0 bytes
    )
)
IF "%CLEAN_CHOICE%"=="4" GOTO MAIN_MENU

PAUSE
GOTO CLEANUP_REPO

REM ============================================================
REM Exit
REM ============================================================
:EXIT
ECHO.
CALL :INFO "Thank you for using Price Alert Management Tool!"
ECHO.
EXIT /B 0
