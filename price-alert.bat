@echo off
REM ============================================================
REM Price Alert CLI - Windows Command Line Interface
REM ============================================================
REM This script provides a user-friendly interface to manage
REM the Price Alert application and its services on Windows.
REM Updated to remove PowerShell dependencies

SETLOCAL EnableDelayedExpansion

REM Check if Node.js is installed
WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO [31mError: Node.js is not installed or not in your PATH.[31m
    ECHO Please install Node.js from https://nodejs.org/
    ECHO.
    PAUSE
    EXIT /B 1
)

REM Show basic header
ECHO.
ECHO [96m============================================================[96m
ECHO [96m               PRICE ALERT CLI - WINDOWS                    [96m
ECHO [96m============================================================[96m
ECHO.

REM Run the CLI with provided arguments
node %~dp0cli.js %*

REM If there's an error, pause to see the message
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO [31mCommand encountered an error. Press any key to exit...[0m
    PAUSE >nul
)

ENDLOCAL
