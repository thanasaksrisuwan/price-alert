#!/usr/bin/env node

/**
 * PriceAlert CLI - Command-line tool for managing the Price Alert project
 * 
 * This tool centralizes installation, testing, running and other commands
 * for the Price Alert project
 */

const { program } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('cross-spawn');
const os = require('os');
const inquirer = require('inquirer');
const ora = require('ora');

// Colors for console output
const colors = {
  info: chalk.blue,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  heading: chalk.cyan.bold,
  highlight: chalk.magenta
};

// We only support Windows
const rootDir = path.resolve(__dirname);
const portableDir = path.join(rootDir, 'portable-env');

/**
 * Displays the CLI banner
 */
function displayBanner() {
  console.log(
    colors.heading(
      figlet.textSync('Price Alert CLI', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log(colors.info('Crypto Price Alert Bot Management System - CLI Tool'));
  console.log(colors.info('Version 1.0.0'));
  console.log(colors.info('======================================================\n'));
}

/**
 * Runs a command in the terminal
 * @param {string} command - The command to run
 * @param {Array<string>} args - The arguments for the command
 * @param {Object} options - The options for running the command
 * @returns {Promise<{stdout: string, stderr: string}>} - Promise with results
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(colors.info(`Running: ${command} ${args.join(' ')}`));
    
    const proc = spawn(command, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command ${command} failed with code ${code}`));
      }
    });
    
    proc.on('error', err => {
      reject(new Error(`Error running command: ${err.message}`));
    });
  });
}

/**
 * Checks if user has admin rights
 * @returns {boolean} - true if admin, false otherwise
 */
function checkIsAdmin() {
  try {
    // Check if user has Admin rights on Windows
    const { status } = spawnSync('net', ['session'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return status === 0;
  } catch (err) {
    return false;
  }
}

/**
 * Installs Node.js dependencies
 */
async function installDependencies() {
  const spinner = ora('Installing required packages...').start();
  try {
    await runCommand('npm', ['install'], { silent: true });
    spinner.succeed('Package installation completed');
  } catch (error) {
    spinner.fail(`Package installation failed: ${error.message}`);
  }
}

/**
 * Checks the status of Redis and PostgreSQL services
 */
async function checkServicesStatus() {
  console.log(colors.heading('\nServices Status:'));

  // Check if portable environment is installed
  const hasPortableEnv = fs.existsSync(portableDir);

  if (hasPortableEnv) {
    console.log(colors.info('Portable Environment:'));
    await runNodeScript('scripts/portable-env.js', ['status']);
  } else {
    console.log(colors.warning('No environments installed. Please use the setup command'));
  }
}

/**
 * Runs a Node.js script
 * @param {string} scriptPath - Path to the script
 * @param {Array<string>} args - Arguments
 */
async function runNodeScript(scriptPath, args = []) {
  try {
    await runCommand('node', [scriptPath, ...args]);
  } catch (error) {
    console.error(colors.error(`Error running script ${scriptPath}: ${error.message}`));
  }
}

/**
 * Creates .env file if it doesn't exist
 */
async function createEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'telegramToken',
        message: 'Telegram Bot Token (from @BotFather):',
        default: 'your_telegram_bot_token'
      },
      {
        type: 'input',
        name: 'port',
        message: 'Port for the application:',
        default: '3000',
        validate: (input) => {
          const port = parseInt(input);
          if (isNaN(port) || port < 1 || port > 65535) {
            return 'Please enter a port between 1-65535';
          }
          return true;
        }
      }
    ]);

    const envContent = `# Application Configuration
NODE_ENV=development
PORT=${answers.port}
LOG_LEVEL=debug

# Portable Database Configuration
DATABASE_URL=postgres://postgres:password@localhost:5433/price_alert_db

# Portable Redis Configuration
REDIS_URL=redis://localhost:6380

# Telegram Bot Token
TELEGRAM_BOT_TOKEN=${answers.telegramToken}
`;

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(colors.success('\n.env file created successfully'));
  } else {
    console.log(colors.info('\n.env file already exists'));
  }
}

/**
 * Shows detailed help screen
 */
function showDetailedHelp() {
  console.clear();
  displayBanner();
  
  console.log(colors.heading('PriceAlert CLI Usage:'));
  console.log(`
${colors.highlight('Setup:')}
  ${colors.success('setup')}             - Install portable environment

${colors.highlight('Running the Application:')}
  ${colors.success('start')}             - Start the application (production mode)
  ${colors.success('dev')}               - Start the application in development mode (with nodemon)

${colors.highlight('Service Management:')}
  ${colors.success('services')}          - Show status of all services
  ${colors.success('services:start')}    - Start all services
  ${colors.success('services:stop')}     - Stop all services

${colors.highlight('Testing:')}
  ${colors.success('test')}              - Run all tests

${colors.highlight('Additional:')}
  ${colors.success('info')}              - Show project information
  ${colors.success('--help')}            - Show detailed usage information
  
  `);
}

/**
 * Shows project information
 */
async function showProjectInfo() {
  const packageJsonPath = path.join(rootDir, 'package.json');
  let packageInfo = {};
  
  try {
    const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
    packageInfo = JSON.parse(packageContent);
  } catch (error) {
    console.error(colors.error(`Cannot read package.json: ${error.message}`));
  }
  
  console.log(colors.heading('\nProject Information:'));
  console.log(colors.info(`Project Name: ${packageInfo.name || 'price-alert'}`));
  console.log(colors.info(`Version: ${packageInfo.version || '1.0.0'}`));
  console.log(colors.info(`Description: ${packageInfo.description || 'Crypto Price Alert Telegram Bot'}`));
  
  console.log(colors.heading('\nSystem Environment:'));
  console.log(colors.info(`Node.js: ${process.version}`));
  console.log(colors.info(`OS: Windows ${os.release()}`));
  console.log(colors.info(`Architecture: ${os.arch()}`));
  console.log(colors.info(`Memory (Total): ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`));
  
  console.log(colors.heading('\nConfiguration Files:'));
  const envExists = fs.existsSync(path.join(rootDir, '.env'));
  console.log(colors.info(`.env file: ${envExists ? 'Present' : 'Not found'}`));
  
  // Check installed environments
  console.log(colors.heading('\nInstalled Environments:'));
  const hasPortableEnv = fs.existsSync(portableDir);
  
  console.log(colors.info(`Portable: ${hasPortableEnv ? 'Installed' : 'Not installed'}`));
  }

/**
 * Sets up portable environment
 */
async function setupPortableEnvironment() {
  console.log(colors.heading('Setting up portable environment...'));
  
  try {
    await createEnvFile();
    await runNodeScript('scripts/portable-env.js', ['install']);
    console.log(colors.success('\nPortable environment setup completed'));
    console.log(colors.info('You can start services with the services:start command'));
  } catch (error) {
    console.error(colors.error(`Setup failed: ${error.message}`));
  }
}

/**
 * Starts portable services
 */
async function startPortableServices() {
  const hasPortableEnv = fs.existsSync(portableDir);
  
  if (!hasPortableEnv) {
    console.log(colors.warning('Portable environment not found. Please run setup first.'));
    return;
  }
  
  console.log(colors.heading('Starting services...'));
  try {
    const startPath = path.join(portableDir, 'start-background.cmd');
    await runCommand('cmd', ['/c', startPath]);
    console.log(colors.success('Services started successfully'));
  } catch (error) {
    console.error(colors.error(`Failed to start services: ${error.message}`));
  }
}

/**
 * Stops portable services
 */
async function stopPortableServices() {
  const hasPortableEnv = fs.existsSync(portableDir);
  
  if (!hasPortableEnv) {
    console.log(colors.warning('Portable environment not found. No services to stop.'));
    return;
  }
  
  console.log(colors.heading('Stopping services...'));
  try {
    const stopPath = path.join(portableDir, 'stop-background.cmd');
    await runCommand('cmd', ['/c', stopPath]);
    console.log(colors.success('Services stopped successfully'));
  } catch (error) {
    console.error(colors.error(`Failed to stop services: ${error.message}`));
  }
}

/**
 * Starts the application
 */
async function startApplication(dev = false) {
  // Check if services are running first
  console.log(colors.info('Checking services status before starting application...'));
  await checkServicesStatus();
  
  // Start the application
  if (dev) {
    console.log(colors.heading('\nStarting application in development mode...'));
    await runCommand('npx', ['nodemon', 'index.js']);
  } else {
    console.log(colors.heading('\nStarting application...'));
    await runCommand('node', ['index.js']);
  }
}

/**
 * Run tests
 */
async function runTests() {
  console.log(colors.heading('Running tests...'));
  try {
    await runCommand('npm', ['test']);
    console.log(colors.success('Tests completed'));
  } catch (error) {
    console.error(colors.error(`Tests failed: ${error.message}`));
  }
}

/**
 * Count files in the project
 */
async function countProjectFiles() {
  let jsFiles = 0;
  let totalFiles = 0;
  
  function countFiles(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      if (file.isDirectory() && !['node_modules', '.git', 'portable-env', 'local-env'].includes(file.name)) {
        countFiles(path.join(dir, file.name));
      } else if (file.isFile()) {
        totalFiles++;
        if (file.name.endsWith('.js')) {
          jsFiles++;
        }
      }
    }
  }
  
  try {
    countFiles(rootDir);
    console.log(colors.info(`จำนวนไฟล์ JavaScript: ${jsFiles}`));
    console.log(colors.info(`จำนวนไฟล์ทั้งหมด: ${totalFiles}`));
  } catch (error) {
    console.error(colors.error(`เกิดข้อผิดพลาดในการนับไฟล์: ${error.message}`));
  }
}

/**
 * เริ่มแอปพลิเคชัน
 */
async function startApp(dev = false) {
  console.log(colors.heading(`กำลังเริ่ม ${dev ? 'โหมดพัฒนา' : 'โหมดผลิต'} ของแอปพลิเคชัน...`));
  
  // ตรวจสอบว่าติดตั้งแพ็กเกจแล้วหรือยัง
  if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
    console.log(colors.warning('ยังไม่ได้ติดตั้งแพ็กเกจ npm กำลังติดตั้งให้...'));
    await installDependencies();
  }
  
  // ตรวจสอบว่ามีไฟล์ .env หรือไม่
  if (!fs.existsSync(path.join(rootDir, '.env'))) {
    console.log(colors.warning('ไม่พบไฟล์ .env กำลังสร้างให้...'));
    await createEnvFile();
  }
  
  try {
    // หากมีการติดตั้งแบบพกพา ให้เริ่มบริการแบบพกพาก่อน
    if (fs.existsSync(portableDir)) {
      console.log(colors.info('พบการติดตั้งแบบพกพา กำลังเริ่มบริการ...'));
      await runNodeScript('scripts/portable-env.js', ['start']);
    }
    
    // เริ่มแอปพลิเคชัน
    const command = dev ? 'nodemon' : 'node';
    const args = [dev ? 'index.js' : 'index.js'];
    
    console.log(colors.success(`\nกำลังเริ่มแอปพลิเคชัน... (${command} ${args.join(' ')})`));
    console.log(colors.info('กด Ctrl+C เพื่อหยุดการทำงาน\n'));
    
    await runCommand(command, args);
  } catch (error) {
    console.error(colors.error(`เกิดข้อผิดพลาดในการเริ่มแอปพลิเคชัน: ${error.message}`));
  }
}

/**
 * เคลียร์ไฟล์ชั่วคราวและอื่นๆ
 */
async function cleanProject() {
  const filesToClean = [
    'logs/combined.log',
    'logs/error.log'
  ];
  
  const dirsToClean = [
    'coverage',
    'dist',
    '.nyc_output',
    'tmp'
  ];
  
  console.log(colors.heading('กำลังทำความสะอาดโครงการ...'));
  
  // ล้างไฟล์บันทึกเหตุการณ์
  for (const file of filesToClean) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.truncateSync(filePath, 0);
        console.log(colors.success(`ล้างไฟล์ ${file} เรียบร้อยแล้ว`));
      } catch (error) {
        console.error(colors.error(`ไม่สามารถล้างไฟล์ ${file}: ${error.message}`));
      }
    }
  }
  
  // ลบไดเรกทอรีชั่วคราว
  for (const dir of dirsToClean) {
    const dirPath = path.join(rootDir, dir);
    if (fs.existsSync(dirPath)) {
      try {
        if (isWindows) {
          await runCommand('rmdir', ['/s', '/q', dirPath], { silent: true });
        } else {
          await runCommand('rm', ['-rf', dirPath], { silent: true });
        }
        console.log(colors.success(`ลบไดเรกทอรี ${dir} เรียบร้อยแล้ว`));
      } catch (error) {
        console.error(colors.error(`ไม่สามารถลบไดเรกทอรี ${dir}: ${error.message}`));
      }
    }
  }
  
  console.log(colors.success('\nทำความสะอาดโครงการเสร็จเรียบร้อย'));
}

/**
 * แสดงไฟล์บันทึก
 */
async function showLogs() {
  const logFiles = {
    'combined.log': path.join(rootDir, 'logs', 'combined.log'),
    'error.log': path.join(rootDir, 'logs', 'error.log')
  };
  
  console.log(colors.heading('ไฟล์บันทึกเหตุการณ์:'));
  
  for (const [name, filePath] of Object.entries(logFiles)) {
    console.log(colors.highlight(`\nไฟล์ ${name}:`));
    
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        console.log(colors.info(`ขนาด: ${(stats.size / 1024).toFixed(2)} KB`));
        
        // อ่าน 20 บรรทัดสุดท้ายของไฟล์
        let content;
        if (isWindows) {
          const result = spawnSync('powershell', ['-Command', `Get-Content -Path "${filePath}" -Tail 20`], { encoding: 'utf8' });
          content = result.stdout;
        } else {
          const result = spawnSync('tail', ['-n', '20', filePath], { encoding: 'utf8' });
          content = result.stdout;
        }
        
        console.log(colors.info('20 บรรทัดล่าสุด:'));
        console.log(content || '(ไฟล์ว่างเปล่า)');
      } catch (error) {
        console.error(colors.error(`ไม่สามารถอ่านไฟล์ ${name}: ${error.message}`));
      }
    } else {
      console.log(colors.warning(`ไม่พบไฟล์ ${name}`));
    }
  }
}

/**
 * รีเซ็ตฐานข้อมูลและนำเข้าสคีมา
 */
async function resetDatabase() {
  console.log(colors.heading('กำลังรีเซ็ตฐานข้อมูล...'));
  
  // ตรวจสอบว่าติดตั้งสภาพแวดล้อมแบบใด
  const hasPortable = fs.existsSync(portableDir);
  const hasLocal = fs.existsSync(localEnvDir);
  
  if (!hasPortable && !hasLocal) {
    console.log(colors.error('ไม่พบการติดตั้งฐานข้อมูล กรุณาติดตั้งก่อน'));
    return;
  }
  
  let dbType = '';
  if (hasPortable && hasLocal) {
    // ถามว่าต้องการรีเซ็ตฐานข้อมูลแบบไหน
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'dbType',
        message: 'เลือกฐานข้อมูลที่ต้องการรีเซ็ต:',
        choices: [
          { name: 'แบบติดตั้งในระบบ (localhost:5432)', value: 'local' },
          { name: 'แบบพกพา (localhost:5433)', value: 'portable' },
          { name: 'ทั้งสองแบบ', value: 'both' }
        ]
      }
    ]);
    dbType = answer.dbType;
  } else if (hasPortable) {
    dbType = 'portable';
  } else {
    dbType = 'local';
  }
  
  // รีเซ็ตฐานข้อมูลตามที่เลือก
  const resetLocal = dbType === 'local' || dbType === 'both';
  const resetPortable = dbType === 'portable' || dbType === 'both';
  
  if (resetLocal) {
    console.log(colors.info('\nกำลังรีเซ็ตฐานข้อมูลแบบติดตั้งในระบบ...'));
    
    try {
      if (isWindows) {
        await runCommand('powershell', ['-Command', `
          & {
            $env:PGPASSWORD = 'password';
            & psql -h localhost -p 5432 -U postgres -c "DROP DATABASE IF EXISTS price_alert_db;"
            & psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE price_alert_db;"
            & psql -h localhost -p 5432 -U postgres -d price_alert_db -f "${path.join(rootDir, 'sql', 'init.sql')}"
          }
        `]);
      } else {
        await runCommand('bash', ['-c', `
          PGPASSWORD=password psql -h localhost -p 5432 -U postgres -c "DROP DATABASE IF EXISTS price_alert_db;"
          PGPASSWORD=password psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE price_alert_db;"
          PGPASSWORD=password psql -h localhost -p 5432 -U postgres -d price_alert_db -f "${path.join(rootDir, 'sql', 'init.sql')}"
        `]);
      }
      console.log(colors.success('รีเซ็ตฐานข้อมูลแบบติดตั้งในระบบเรียบร้อยแล้ว'));
    } catch (error) {
      console.error(colors.error(`รีเซ็ตฐานข้อมูลแบบติดตั้งในระบบล้มเหลว: ${error.message}`));
    }
  }
  
  if (resetPortable) {
    console.log(colors.info('\nกำลังรีเซ็ตฐานข้อมูลแบบพกพา...'));
    
    try {
      const pgBinPath = path.join(portableDir, 'pgsql', 'bin');
      
      if (isWindows) {
        await runCommand('powershell', ['-Command', `
          & {
            $env:PGPASSWORD = 'password';
            & "${path.join(pgBinPath, 'psql.exe')}" -h localhost -p 5433 -U postgres -c "DROP DATABASE IF EXISTS price_alert_db;"
            & "${path.join(pgBinPath, 'psql.exe')}" -h localhost -p 5433 -U postgres -c "CREATE DATABASE price_alert_db;"
            & "${path.join(pgBinPath, 'psql.exe')}" -h localhost -p 5433 -U postgres -d price_alert_db -f "${path.join(rootDir, 'sql', 'init.sql')}"
          }
        `]);
      } else {
        await runCommand('bash', ['-c', `
          PGPASSWORD=password "${path.join(pgBinPath, 'psql')}" -h localhost -p 5433 -U postgres -c "DROP DATABASE IF EXISTS price_alert_db;"
          PGPASSWORD=password "${path.join(pgBinPath, 'psql')}" -h localhost -p 5433 -U postgres -c "CREATE DATABASE price_alert_db;"
          PGPASSWORD=password "${path.join(pgBinPath, 'psql')}" -h localhost -p 5433 -U postgres -d price_alert_db -f "${path.join(rootDir, 'sql', 'init.sql')}"
        `]);
      }
      console.log(colors.success('รีเซ็ตฐานข้อมูลแบบพกพาเรียบร้อยแล้ว'));
    } catch (error) {
      console.error(colors.error(`รีเซ็ตฐานข้อมูลแบบพกพาล้มเหลว: ${error.message}`));
    }
  }
  
  console.log(colors.success('\nรีเซ็ตฐานข้อมูลเสร็จสมบูรณ์'));
}

/**
 * เริ่มกระบวนการติดตั้ง
 */
async function setupWizard() {
  console.log(colors.heading('\nต้วช่วยติดตั้งสภาพแวดล้อม\n'));
  
  const isAdmin = checkIsAdmin();
  
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'installType',
      message: 'เลือกประเภทการติดตั้งที่คุณต้องการ:',
      choices: [
        { name: 'แบบติดตั้งในระบบ (ต้องการสิทธิ์ Administrator ' + (isAdmin ? '✓' : '✗') + ')', value: 'local' },
        { name: 'แบบพกพา (ไม่ต้องการสิทธิ์ Administrator)', value: 'portable' },
        { name: 'ยกเลิก', value: 'cancel' }
      ]
    }
  ]);
  
  if (answers.installType === 'cancel') {
    console.log(colors.info('ยกเลิกการติดตั้ง'));
    return;
  }
  
  if (answers.installType === 'local' && !isAdmin) {
    console.log(colors.warning('คำเตือน: การติดตั้งแบบในระบบต้องการสิทธิ์ Administrator'));
    const continueAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'คุณต้องการดำเนินการต่อหรือไม่? อาจเกิดข้อผิดพลาดในการติดตั้ง',
        default: false
      }
    ]);
    
    if (!continueAnswer.continue) {
      console.log(colors.info('ยกเลิกการติดตั้ง'));
      return;
    }
  }
  
  if (answers.installType === 'local') {
    // ติดตั้งแบบในระบบ
    console.log(colors.info('\nกำลังติดตั้งแบบในระบบ...'));
    await runNodeScript('scripts/setup-local.js');
  } else {
    // ติดตั้งแบบพกพา
    console.log(colors.info('\nกำลังติดตั้งแบบพกพา...'));
    await runNodeScript('scripts/portable-env.js', ['install']);
  }
}

/**
 * เริ่มบริการทั้งหมด
 */
async function startServices() {
  console.log(colors.heading('กำลังเริ่มบริการ...'));
  
  const hasPortable = fs.existsSync(portableDir);
  
  if (hasPortable) {
    console.log(colors.info('\nกำลังเริ่มบริการแบบพกพา...'));
    await runNodeScript('scripts/portable-env.js', ['start']);
  } else {
    console.log(colors.warning('\nไม่พบการติดตั้งแบบพกพา'));
    console.log(colors.info('หมายเหตุ: หากคุณติดตั้งแบบในระบบ บริการควรเริ่มต้นโดยอัตโนมัติ'));
  }
  
  console.log(colors.success('\nเริ่มบริการทั้งหมดเรียบร้อยแล้ว'));
}

/**
 * หยุดบริการทั้งหมด
 */
async function stopServices() {
  console.log(colors.heading('กำลังหยุดบริการ...'));
  
  const hasPortable = fs.existsSync(portableDir);
  
  if (hasPortable) {
    console.log(colors.info('\nกำลังหยุดบริการแบบพกพา...'));
    await runNodeScript('scripts/portable-env.js', ['stop']);
  } else {
    console.log(colors.warning('\nไม่พบการติดตั้งแบบพกพา'));
    console.log(colors.info('หมายเหตุ: หากคุณติดตั้งแบบในระบบ คุณอาจต้องหยุดบริการผ่านเครื่องมือระบบ'));
  }
  
  console.log(colors.success('\nหยุดบริการทั้งหมดเรียบร้อยแล้ว'));
}

// Set up the CLI commands
program
  .name('price-alert')
  .description('CLI for the Price Alert Crypto Bot project')
  .version('1.0.0');

// Setup commands
program
  .command('setup')
  .description('Set up portable environment')
  .action(setupPortableEnvironment);

// Service commands
program
  .command('services')
  .description('Check services status')
  .action(checkServicesStatus);

program
  .command('services:start')
  .description('Start services')
  .action(startPortableServices);

program
  .command('services:stop')
  .description('Stop services')
  .action(stopPortableServices);

// Application commands
program
  .command('start')
  .description('Start the application')
  .action(() => startApplication(false));

program
  .command('dev')
  .description('Start the application in development mode')
  .action(() => startApplication(true));

// Testing command
program
  .command('test')
  .description('Run tests')
  .action(runTests);

// Info command
program
  .command('info')
  .description('Show project information')
  .action(showProjectInfo);

// Files count command
program
  .command('count-files')
  .description('Count JavaScript and total files in the project')
  .action(countProjectFiles);

// Help command
program
  .command('help')
  .description('Show detailed help')
  .action(showDetailedHelp);

// Handle unknown commands
program.on('command:*', () => {
  console.error(colors.error(`Invalid command: ${program.args.join(' ')}`));
  console.log(colors.info('See --help for a list of available commands.'));
  process.exit(1);
});

// Default action if no command is specified
if (process.argv.length === 2) {
  showDetailedHelp();
} else {
  program.parse(process.argv);
}

