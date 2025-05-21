# Price Alert - Windows Management Tools

## Improved Windows Batch Files

This project has been updated to eliminate PowerShell dependencies and consolidate all the management functionalities into Windows batch (.bat/.cmd) files for better Windows compatibility and simplified management.

## Available Management Tools

### 1. `price-alert-manage.bat`

The main management tool for the Price Alert application that provides comprehensive functionality:

- **Setup Environment:** Download and configure portable Redis and PostgreSQL
- **Start/Stop Services:** Control the background services
- **Application Management:** Start in production or development mode
- **Testing:** Run test suites
- **Repository Maintenance:** Clean up and analyze repository size

### 2. `portable-env\portable-services.cmd`

A dedicated tool for managing portable Redis and PostgreSQL services:

- **Start Services:** `portable-services.cmd start`
- **Stop Services:** `portable-services.cmd stop`
- **Check Status:** `portable-services.cmd status`

### 3. `quick-start.cmd`

A user-friendly menu interface for common operations:

- Setup environment
- Start/stop services
- Start application in production/development mode
- Run tests
- View project information
- Check service status

### 4. `price-alert.bat` 

Command-line interface to interact with the Node.js CLI:

```
price-alert.bat <command>
```

## Usage

1. **First-time setup:**
   - Run `quick-start.cmd` and select option 1 to set up the environment
   
2. **Start development:**
   - Run `quick-start.cmd` and select option 2 to start services
   - Then select option 5 to start the application in development mode
   
3. **Start production:**
   - Run `quick-start.cmd` and select option 2 to start services
   - Then select option 4 to start the application in production mode

4. **Advanced management:**
   - Run `price-alert-manage.bat` for more advanced options

## Technical Details

The management tools have been simplified to use only Windows batch files, eliminating all PowerShell dependencies. Key improvements include:

- Consolidated scripts for better maintainability
- Consistent error handling and status reporting
- Proper process management for services
- Visual enhancements with colored output
- Simplified management of portable Redis and PostgreSQL services

## Requirements

- Windows Operating System
- Node.js installed and in PATH
- Internet connection (for first-time setup)
