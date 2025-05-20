@echo off
REM Price Alert CLI - Launcher
REM This script helps users run the CLI command quickly on Windows

node %~dp0cli.js %*

REM If there's an error, pause to see the message
if %errorlevel% neq 0 pause
