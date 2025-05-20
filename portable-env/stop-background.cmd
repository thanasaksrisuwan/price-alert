# filepath: c:\Users\Nack\Documents\price-alert\portable-env\stop-background.cmd
@echo off
:: Stop Redis and PostgreSQL background services
PowerShell -ExecutionPolicy Bypass -File "%~dp0stop-background-services.ps1"
