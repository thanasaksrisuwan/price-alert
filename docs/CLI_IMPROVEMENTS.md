# CLI Improvements Documentation

## Summary of Changes

This document outlines the improvements made to the Price Alert CLI system:

1. **Focused on Windows Only**: All Linux/Unix support has been removed to streamline the codebase
2. **Removed Unnecessary Commands**: Simplified the CLI by removing redundant and rarely used commands
3. **Improved Windows Batch Files**: Enhanced the batch files for better user experience
4. **Added Quick Start Menu**: Created an interactive menu for common operations
5. **Simplified Environment Setup**: Consolidated environment setup procedures

## Key Improvements

### 1. Streamlined CLI Structure

The CLI has been restructured to focus on essential functionality only:

- **Setup**: Just one command to set up the portable environment
- **Services Management**: Start, stop and check services status
- **Application Control**: Start in production or development modes
- **Testing**: Run tests easily
- **Information**: Get project details quickly

### 2. Windows-Optimized Batch Files

- **price-alert.bat**: Improved error handling and user feedback
- **quick-start.cmd**: New interactive menu system for easier navigation

### 3. Removed Functionality

The following functionality was removed to streamline the experience:

- Local environment installation (now only portable is supported)
- Complex database reset operations
- Log viewing functionality
- Repository cleaning tools
- All Linux/Unix specific scripts

### 4. Usage Instructions

#### Using quick-start.cmd

The new quick-start menu provides an easy way to access all functionality:

1. Double-click `quick-start.cmd`
2. Select the desired operation from the numbered menu
3. Follow the on-screen instructions

#### Using price-alert.bat directly

For command-line users, `price-alert.bat` can be used directly:

```batch
price-alert.bat setup              # Set up portable environment
price-alert.bat services           # Check services status
price-alert.bat services:start     # Start services
price-alert.bat services:stop      # Stop services
price-alert.bat start              # Start application
price-alert.bat dev                # Start in development mode
price-alert.bat test               # Run tests
price-alert.bat info               # Show project information
price-alert.bat help               # Show detailed help
```

#### Using NPM Scripts

The package.json scripts have been updated for simplicity:

```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "jest",
  "setup": "node cli.js setup",
  "services": "node cli.js services",
  "services:start": "node cli.js services:start",
  "services:stop": "node cli.js services:stop",
  "cli": "node cli.js",
  "quickstart": "cmd /c quick-start.cmd"
}
```
