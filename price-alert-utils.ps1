# price-alert-utils.ps1
#
# Unified PowerShell utilities for Price Alert project
# This script provides functionality for environment setup, service management,
# and repository maintenance.

#region Parameters and Constants
# Default parameters
param (
    [Parameter(Position=0)]
    [ValidateSet("setup", "start", "stop", "status", "clean", "analyze", "help", "")]
    [string]$Command = "",
    
    [Parameter(Position=1)]
    [string]$Type = "portable"  # portable or local
)

# Environment settings
$ErrorActionPreference = "Stop"
$POSTGRESQL_VERSION = "15.4-1"
$REDIS_VERSION = "5.0.14.1"
$PG_DB_NAME = "price_alert_db"
$PG_USER = "postgres"
$PG_PASSWORD = "postgres"
$PORTABLE_REDIS_PORT = 6380
$PORTABLE_PG_PORT = 5433
$LOCAL_REDIS_PORT = 6379
$LOCAL_PG_PORT = 5432

# Paths
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$portableDir = Join-Path $workingDirectory "portable-env"
$localEnvDir = Join-Path $workingDirectory "local-env"
#endregion

#region Helper Functions
function Write-Header {
    param (
        [string]$text
    )
    
    Write-Host "`n===== $text =====" -ForegroundColor Cyan
}

function Write-Success {
    param (
        [string]$text
    )
    
    Write-Host $text -ForegroundColor Green
}

function Write-Info {
    param (
        [string]$text
    )
    
    Write-Host $text -ForegroundColor Yellow
}

function Write-Error {
    param (
        [string]$text
    )
    
    Write-Host $text -ForegroundColor Red
}

function Download-File {
    param (
        [string]$url,
        [string]$destination
    )
    
    Write-Info "Downloading from $url"
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
        Write-Success "Download successful: $destination"
        return $true
    } catch {
        Write-Error "Download failed: $($_.Exception.Message)"
        return $false
    }
}

function Extract-ZipFile {
    param (
        [string]$zipFile,
        [string]$destination
    )
    
    Write-Info "Extracting $zipFile..."
    try {
        Expand-Archive -Path $zipFile -DestinationPath $destination -Force
        Write-Success "Extraction successful to $destination"
        return $true
    } catch {
        Write-Error "Extraction failed: $($_.Exception.Message)"
        return $false
    }
}

function Test-CommandAvailable {
    param (
        [string]$command
    )
    
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-DatabaseExists {
    param (
        [string]$databaseName,
        [string]$port = "5432" 
    )
    
    try {
        $env:PGPASSWORD = $PG_PASSWORD
        $result = & psql -p $port -U $PG_USER -tAc "SELECT 1 FROM pg_database WHERE datname='$databaseName'"
        return $result -eq "1"
    } catch {
        return $false
    }
}

function Test-ServiceRunning {
    param (
        [string]$serviceName
    )
    
    try {
        $service = Get-Service -Name $serviceName -ErrorAction Stop
        return $service.Status -eq "Running"
    } catch {
        return $false
    }
}
#endregion

#region Portable Environment Functions
function Setup-PortableEnvironment {
    Write-Header "Setting up portable environment"
    
    # Create directories
    if (-not (Test-Path $portableDir)) {
        New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
    }
    
    $redisDir = Join-Path $portableDir "redis"
    $pgsqlDir = Join-Path $portableDir "pgsql"
    $tempDir = Join-Path $portableDir "temp"
    $pidsDir = Join-Path $portableDir "pids"
    
    # Create directories if they don't exist
    foreach ($dir in @($redisDir, $pgsqlDir, $tempDir, $pidsDir)) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    # Download and extract Redis
    if (-not (Test-Path "$redisDir\redis-server.exe")) {
        $redisUrl = "https://github.com/microsoftarchive/redis/releases/download/win-$REDIS_VERSION/Redis-x64-$REDIS_VERSION.zip"
        $redisZip = Join-Path $tempDir "redis.zip"
        
        if (Download-File -url $redisUrl -destination $redisZip) {
            Extract-ZipFile -zipFile $redisZip -destination $redisDir
            
            # Create Redis portable config
            @"
# Redis configuration file for portable use
port $PORTABLE_REDIS_PORT
bind 127.0.0.1
loglevel notice
logfile "logs/redis_portable.log"
dbfilename dump_portable.rdb
dir ./
"@ | Out-File -FilePath (Join-Path $redisDir "redis.portable.conf") -Encoding utf8
            
            # Create logs directory
            New-Item -ItemType Directory -Path (Join-Path $redisDir "logs") -Force | Out-Null
        } else {
            Write-Error "Failed to download Redis"
        }
    } else {
        Write-Success "Redis already installed in portable environment"
    }
    
    # Download and extract PostgreSQL
    if (-not (Test-Path "$pgsqlDir\bin\pg_ctl.exe")) {
        $pgsqlUrl = "https://get.enterprisedb.com/postgresql/postgresql-$POSTGRESQL_VERSION-windows-x64-binaries.zip"
        $pgsqlZip = Join-Path $tempDir "pgsql.zip"
        
        if (Download-File -url $pgsqlUrl -destination $pgsqlZip) {
            Extract-ZipFile -zipFile $pgsqlZip -destination $pgsqlDir
            
            # Create data directory
            $dataDir = Join-Path $pgsqlDir "data"
            if (-not (Test-Path $dataDir)) {
                New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
                
                # Initialize PostgreSQL database
                $initdb = Join-Path $pgsqlDir "bin\initdb.exe"
                & $initdb -D "$dataDir" -U $PG_USER --encoding=UTF8 --locale=C
                
                # Update PostgreSQL config for portable use
                @"
listen_addresses = 'localhost'
port = $PORTABLE_PG_PORT
"@ | Out-File -FilePath (Join-Path $dataDir "postgresql.conf") -Encoding utf8 -Append
            }
        } else {
            Write-Error "Failed to download PostgreSQL"
        }
    } else {
        Write-Success "PostgreSQL already installed in portable environment"
    }
    
    # Create start and stop scripts
    Create-PortableServiceScripts
    
    # Create .env file if it doesn't exist
    Create-EnvFile -isPortable $true
    
    # Remove temporary files
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    Write-Success "Portable environment setup completed!"
    Write-Info "Use 'price-alert.bat services:start' to start Redis and PostgreSQL services"
}

function Create-PortableServiceScripts {
    $startScriptPath = Join-Path $portableDir "start-services.ps1"
    $stopScriptPath = Join-Path $portableDir "stop-services.ps1"
    
    # Start services script
    @"
# Script to start portable Redis and PostgreSQL services
`$ErrorActionPreference = "Stop"
`$workingDirectory = Split-Path -Parent `$MyInvocation.MyCommand.Definition
`$redisDir = Join-Path `$workingDirectory "redis"
`$pgsqlDir = Join-Path `$workingDirectory "pgsql"
`$dataDir = Join-Path `$pgsqlDir "data"
`$redisServer = Join-Path `$redisDir "redis-server.exe"
`$redisConfig = Join-Path `$redisDir "redis.portable.conf"
`$pgCtl = Join-Path `$pgsqlDir "bin\pg_ctl.exe"

# Create directory for PID files
`$pidDir = Join-Path `$workingDirectory "pids"
if (-not (Test-Path `$pidDir)) {
    New-Item -ItemType Directory -Path `$pidDir -Force | Out-Null
}

# Start Redis
Write-Host "Starting Redis..." -ForegroundColor Yellow
Start-Process -FilePath `$redisServer -ArgumentList "`"`$redisConfig`"" -NoNewWindow

# Wait a moment for Redis to start
Start-Sleep -Seconds 2

# Start PostgreSQL
Write-Host "Starting PostgreSQL..." -ForegroundColor Yellow
`$env:PGPORT = "$PORTABLE_PG_PORT"
`$env:PGDATA = `$dataDir
Start-Process -FilePath `$pgCtl -ArgumentList "start -D `"`$dataDir`" -o `"-p $PORTABLE_PG_PORT`"" -Wait -NoNewWindow

# Create database if it doesn't exist
`$psql = Join-Path `$pgsqlDir "bin\psql.exe"
`$createdbExe = Join-Path `$pgsqlDir "bin\createdb.exe"

# Check if database exists
Write-Host "Checking database..." -ForegroundColor Yellow
`$dbExists = & `$psql -p $PORTABLE_PG_PORT -U postgres -c "SELECT 1 FROM pg_database WHERE datname = '$PG_DB_NAME'" | Select-String -Pattern "1 row"

if (-not `$dbExists) {
    Write-Host "Creating database $PG_DB_NAME..." -ForegroundColor Yellow
    & `$createdbExe -p $PORTABLE_PG_PORT -U postgres $PG_DB_NAME
    
    # Import schema if init.sql exists
    `$initSqlFile = Join-Path `$workingDirectory "..\sql\init.sql"
    if (Test-Path `$initSqlFile) {
        Write-Host "Importing database schema..." -ForegroundColor Yellow
        & `$psql -p $PORTABLE_PG_PORT -U postgres -d $PG_DB_NAME -f `$initSqlFile
    }
}

Write-Host "All services started" -ForegroundColor Green
Write-Host "Redis is running on localhost:$PORTABLE_REDIS_PORT" -ForegroundColor Cyan
Write-Host "PostgreSQL is running on localhost:$PORTABLE_PG_PORT (User: $PG_USER, Database: $PG_DB_NAME)" -ForegroundColor Cyan
"@ | Out-File -FilePath $startScriptPath -Encoding utf8
    
    # Stop services script
    @"
# Script to stop portable Redis and PostgreSQL services
`$ErrorActionPreference = "Stop"
`$workingDirectory = Split-Path -Parent `$MyInvocation.MyCommand.Definition
`$pgsqlDir = Join-Path `$workingDirectory "pgsql"
`$dataDir = Join-Path `$pgsqlDir "data"
`$pgCtl = Join-Path `$pgsqlDir "bin\pg_ctl.exe"
`$redisCliExe = Join-Path `$workingDirectory "redis\redis-cli.exe"

# Stop PostgreSQL
Write-Host "Stopping PostgreSQL..." -ForegroundColor Yellow
`$env:PGPORT = "$PORTABLE_PG_PORT"
`$env:PGDATA = `$dataDir
Start-Process -FilePath `$pgCtl -ArgumentList "stop -D `"`$dataDir`"" -Wait -NoNewWindow

# Stop Redis
Write-Host "Stopping Redis..." -ForegroundColor Yellow
Start-Process -FilePath `$redisCliExe -ArgumentList "-p $PORTABLE_REDIS_PORT shutdown" -Wait -NoNewWindow

Write-Host "All services stopped" -ForegroundColor Green
"@ | Out-File -FilePath $stopScriptPath -Encoding utf8
}

function Start-PortableServices {
    $startScript = Join-Path $portableDir "start-services.ps1"
    
    if (Test-Path $startScript) {
        Write-Header "Starting portable services"
        & $startScript
    } else {
        Write-Error "Portable environment not found. Run setup first."
        Write-Info "Use 'price-alert.bat setup' to set up the environment"
    }
}

function Stop-PortableServices {
    $stopScript = Join-Path $portableDir "stop-services.ps1"
    
    if (Test-Path $stopScript) {
        Write-Header "Stopping portable services"
        & $stopScript
    } else {
        Write-Error "Portable environment not found. Run setup first."
        Write-Info "Use 'price-alert.bat setup' to set up the environment"
    }
}

function Check-PortableStatus {
    Write-Header "Checking portable services status"
    
    # Check Redis
    try {
        $redisCliExe = Join-Path $portableDir "redis\redis-cli.exe"
        $redisResponse = & $redisCliExe -p $PORTABLE_REDIS_PORT ping 2>&1
        $redisRunning = $redisResponse -eq "PONG"
        
        if ($redisRunning) {
            Write-Success "✅ Redis is running on port $PORTABLE_REDIS_PORT"
        } else {
            Write-Error "❌ Redis is not running"
        }
    } catch {
        Write-Error "❌ Redis is not running"
    }
    
    # Check PostgreSQL
    try {
        $env:PGPASSWORD = $PG_PASSWORD
        $psqlExe = Join-Path $portableDir "pgsql\bin\psql.exe"
        $pgResponse = & $psqlExe -p $PORTABLE_PG_PORT -U $PG_USER -c "SELECT version();" 2>&1
        $pgRunning = $pgResponse -match "PostgreSQL"
        
        if ($pgRunning) {
            Write-Success "✅ PostgreSQL is running on port $PORTABLE_PG_PORT"
            
            # Check if price_alert_db exists
            $dbExists = & $psqlExe -p $PORTABLE_PG_PORT -U $PG_USER -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB_NAME'"
            
            if ($dbExists -eq "1") {
                Write-Success "✅ Database '$PG_DB_NAME' exists"
            } else {
                Write-Error "❌ Database '$PG_DB_NAME' not found"
            }
        } else {
            Write-Error "❌ PostgreSQL is not running"
        }
    } catch {
        Write-Error "❌ PostgreSQL is not running"
    }
}
#endregion

#region Local Environment Functions
function Setup-LocalEnvironment {
    Write-Header "Setting up local environment"
    
    # Check if Chocolatey is installed
    if (-not (Test-CommandAvailable "choco")) {
        Write-Info "Installing Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    } else {
        Write-Success "Chocolatey is already installed"
    }
    
    # Install PostgreSQL
    if (-not (Test-CommandAvailable "psql")) {
        Write-Info "Installing PostgreSQL..."
        choco install postgresql15 --params "/Password:$PG_PASSWORD" -y
        
        # Update PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        
        # Wait for PostgreSQL to start
        Start-Sleep -Seconds 5
        
        # Create database
        Write-Info "Creating database '$PG_DB_NAME'..."
        $env:PGPASSWORD = $PG_PASSWORD
        & psql -U $PG_USER -c "CREATE DATABASE $PG_DB_NAME;"
        
        # Import schema
        $initSqlFile = Join-Path $workingDirectory "sql\init.sql"
        if (Test-Path $initSqlFile) {
            Write-Info "Importing database schema..."
            & psql -U $PG_USER -d $PG_DB_NAME -f $initSqlFile
        } else {
            Write-Error "SQL schema file not found (sql\init.sql)"
        }
    } else {
        Write-Success "PostgreSQL is already installed"
        
        # Check if database exists
        if (-not (Test-DatabaseExists -databaseName $PG_DB_NAME)) {
            Write-Info "Creating database '$PG_DB_NAME'..."
            $env:PGPASSWORD = $PG_PASSWORD
            & psql -U $PG_USER -c "CREATE DATABASE $PG_DB_NAME;"
            
            # Import schema
            $initSqlFile = Join-Path $workingDirectory "sql\init.sql"
            if (Test-Path $initSqlFile) {
                Write-Info "Importing database schema..."
                & psql -U $PG_USER -d $PG_DB_NAME -f $initSqlFile
            }
        } else {
            Write-Success "Database '$PG_DB_NAME' already exists"
        }
    }
    
    # Install Redis
    $redisService = Get-Service -Name "Redis" -ErrorAction SilentlyContinue
    
    if (-not $redisService) {
        Write-Info "Installing Redis..."
        choco install redis-64 -y
        
        # Setup Redis service
        Write-Info "Setting up Redis service..."
        redis-server --service-install
        redis-server --service-start
    } else {
        Write-Success "Redis is already installed"
        
        # Check if Redis is running
        if ($redisService.Status -ne "Running") {
            Write-Info "Starting Redis service..."
            Start-Service -Name "Redis"
        }
    }
    
    # Create .env file
    Create-EnvFile -isPortable $false
    
    Write-Success "Local environment setup completed!"
    Write-Info "PostgreSQL is running on port $LOCAL_PG_PORT (User: $PG_USER, Database: $PG_DB_NAME)"
    Write-Info "Redis is running on port $LOCAL_REDIS_PORT"
}

function Start-LocalServices {
    Write-Header "Starting local services"
    
    # Start PostgreSQL service
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    
    if ($pgService) {
        if ($pgService.Status -ne "Running") {
            Write-Info "Starting PostgreSQL service..."
            Start-Service $pgService.Name
        }
        Write-Success "✅ PostgreSQL is running"
    } else {
        Write-Error "❌ PostgreSQL service not found"
        Write-Info "Run 'price-alert.bat setup' to install services"
    }
    
    # Start Redis service
    $redisService = Get-Service -Name "Redis" -ErrorAction SilentlyContinue
    
    if ($redisService) {
        if ($redisService.Status -ne "Running") {
            Write-Info "Starting Redis service..."
            Start-Service -Name "Redis"
        }
        Write-Success "✅ Redis is running"
    } else {
        Write-Error "❌ Redis service not found"
        Write-Info "Run 'price-alert.bat setup' to install services"
    }
}

function Stop-LocalServices {
    Write-Header "Stopping local services"
    
    # Stop Redis service
    $redisService = Get-Service -Name "Redis" -ErrorAction SilentlyContinue
    
    if ($redisService) {
        if ($redisService.Status -eq "Running") {
            Write-Info "Stopping Redis service..."
            Stop-Service -Name "Redis"
            Write-Success "Redis service stopped"
        } else {
            Write-Info "Redis service is already stopped"
        }
    } else {
        Write-Error "Redis service not found"
    }
    
    # Stop PostgreSQL service
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    
    if ($pgService) {
        if ($pgService.Status -eq "Running") {
            Write-Info "Stopping PostgreSQL service..."
            Stop-Service $pgService.Name
            Write-Success "PostgreSQL service stopped"
        } else {
            Write-Info "PostgreSQL service is already stopped"
        }
    } else {
        Write-Error "PostgreSQL service not found"
    }
}

function Check-LocalStatus {
    Write-Header "Checking local services status"
    
    # Check PostgreSQL
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    
    if ($pgService) {
        if ($pgService.Status -eq "Running") {
            Write-Success "✅ PostgreSQL service is running"
            
            # Check database
            if (Test-DatabaseExists -databaseName $PG_DB_NAME) {
                Write-Success "✅ Database '$PG_DB_NAME' exists"
            } else {
                Write-Error "❌ Database '$PG_DB_NAME' not found"
            }
        } else {
            Write-Error "❌ PostgreSQL service is not running"
        }
    } else {
        Write-Error "❌ PostgreSQL service is not installed"
    }
    
    # Check Redis
    $redisService = Get-Service -Name "Redis" -ErrorAction SilentlyContinue
    
    if ($redisService) {
        if ($redisService.Status -eq "Running") {
            Write-Success "✅ Redis service is running"
        } else {
            Write-Error "❌ Redis service is not running"
        }
    } else {
        Write-Error "❌ Redis service is not installed"
    }
}
#endregion

#region Common Functions
function Create-EnvFile {
    param (
        [bool]$isPortable = $true
    )
    
    $envFile = Join-Path $workingDirectory ".env"
    
    if (-not (Test-Path $envFile)) {
        Write-Info "Creating .env file..."
        
        $pgPort = if ($isPortable) { $PORTABLE_PG_PORT } else { $LOCAL_PG_PORT }
        $redisPort = if ($isPortable) { $PORTABLE_REDIS_PORT } else { $LOCAL_REDIS_PORT }
        
        @"
# Application configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database configuration
DATABASE_URL=postgres://$PG_USER:$PG_PASSWORD@localhost:$pgPort/$PG_DB_NAME

# Redis configuration
REDIS_URL=redis://localhost:$redisPort

# Add your Telegram Bot Token here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
"@ | Out-File -FilePath $envFile -Encoding utf8
        
        Write-Success ".env file created"
        Write-Info "Remember to set your Telegram Bot Token in the .env file"
    } else {
        Write-Info ".env file already exists"
    }
}

function Show-Help {
    Write-Host @"

Price Alert Utils - PowerShell utilities for Price Alert project

Usage:
    price-alert-utils.ps1 [command] [type]

Commands:
    setup       - Set up environment (PostgreSQL + Redis)
    start       - Start services
    stop        - Stop services
    status      - Check services status
    clean       - Clean up temporary files
    analyze     - Analyze Git repository size
    help        - Show this help message

Types:
    portable    - Portable environment (default)
    local       - Local environment (installed as services)

Examples:
    price-alert-utils.ps1 setup portable
    price-alert-utils.ps1 start local
    price-alert-utils.ps1 status

"@ -ForegroundColor White
}

function Clean-TemporaryFiles {
    Write-Header "Cleaning temporary files"
    
    # Clean portable temp directory
    $portableTempDir = Join-Path $portableDir "temp"
    if (Test-Path $portableTempDir) {
        Write-Info "Removing portable temporary files..."
        Remove-Item -Path $portableTempDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Portable temporary files removed"
    }
    
    # Clean logs
    $logsDir = Join-Path $workingDirectory "logs"
    if (Test-Path $logsDir) {
        Write-Info "Cleaning log files..."
        $logfiles = Get-ChildItem -Path $logsDir -Filter "*.log"
        foreach ($logfile in $logfiles) {
            if ($logfile.Length -gt 5MB) {
                Write-Info "Truncating $($logfile.Name) (Size: $([math]::Round($logfile.Length / 1MB, 2)) MB)"
                Clear-Content -Path $logfile.FullName
                Write-Success "$($logfile.Name) truncated"
            }
        }
    }
    
    # Remove Node.js cache
    $nodeModulesDir = Join-Path $workingDirectory "node_modules\.cache"
    if (Test-Path $nodeModulesDir) {
        Write-Info "Cleaning Node.js cache..."
        Remove-Item -Path $nodeModulesDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Node.js cache cleaned"
    }
    
    Write-Success "Cleanup completed!"
}

function Analyze-Repository {
    Write-Header "Analyzing Git Repository Size"
    
    # Check if git is installed
    if (-not (Test-CommandAvailable "git")) {
        Write-Error "Git is not installed or not in PATH"
        return
    }
    
    # Get repository size
    try {
        $stats = git count-objects -vH
        $statsLines = $stats -split "`n"
        
        foreach ($line in $statsLines) {
            if ($line -match "size-pack:") {
                $size = $line -replace ".*size-pack:\s+", ""
                Write-Host "Repository size: " -NoNewline
                Write-Host "$size" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Error "Failed to get repository size: $($_.Exception.Message)"
    }
    
    # Find large files in git history
    Write-Info "Searching for large files in Git history..."
    
    try {
        $largeObjects = @()
        
        git rev-list --objects --all | ForEach-Object {
            $line = $_
            if ($line -match "^([0-9a-f]+)\s+(.+)$") {
                $hash = $Matches[1]
                $path = $Matches[2]
                
                if ($path) {
                    $size = git cat-file -s $hash
                    $sizeMB = [Math]::Round($size / 1MB, 2)
                    
                    if ($sizeMB -ge 1) {
                        $largeObjects += [PSCustomObject]@{
                            Hash = $hash
                            Path = $path
                            SizeMB = $sizeMB
                        }
                    }
                }
            }
        }
        
        if ($largeObjects.Count -gt 0) {
            $largeObjects = $largeObjects | Sort-Object -Property SizeMB -Descending | Select-Object -First 15
            
            Write-Host "`nTop 15 largest files in Git history:" -ForegroundColor Cyan
            $largeObjects | Format-Table -Property Path, @{Name='Size (MB)'; Expression={$_.SizeMB}; Alignment='Right'}
            
            Write-Info "To clean up large files from Git history, use BFG Repo Cleaner:"
            Write-Host "1. Make a backup of your repository"
            Write-Host "2. Run: bfg --strip-blobs-bigger-than 10M ."
            Write-Host "3. Run: git reflog expire --expire=now --all"
            Write-Host "4. Run: git gc --prune=now --aggressive"
        } else {
            Write-Success "No large files (>1MB) found in Git history"
        }
    } catch {
        Write-Error "Failed to analyze repository: $($_.Exception.Message)"
    }
}
#endregion

#region Main Execution
# Execute command based on arguments
switch ($Command) {
    "setup" {
        if ($Type -eq "portable") {
            Setup-PortableEnvironment
        } else {
            Setup-LocalEnvironment
        }
    }
    "start" {
        if ($Type -eq "portable") {
            Start-PortableServices
        } else {
            Start-LocalServices
        }
    }
    "stop" {
        if ($Type -eq "portable") {
            Stop-PortableServices
        } else {
            Stop-LocalServices
        }
    }
    "status" {
        if ($Type -eq "portable") {
            Check-PortableStatus
        } else {
            Check-LocalStatus
        }
    }
    "clean" {
        Clean-TemporaryFiles
    }
    "analyze" {
        Analyze-Repository
    }
    default {
        Show-Help
    }
}
#endregion
