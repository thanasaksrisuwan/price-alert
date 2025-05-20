# filepath: c:\Users\Nack\Documents\price-alert\portable-env\start-background.cmd
@echo off
:: Start Redis and PostgreSQL as background services
PowerShell -ExecutionPolicy Bypass -File "%~dp0run-background-services.ps1"
