#!/usr/bin/env node

/**
 * PriceAlert CLI - เครื่องมือบรรทัดคำสั่งกลางสำหรับจัดการโครงการ
 * 
 * เครื่องมือนี้รวมการจัดการ การติดตั้ง การทดสอบ การรัน และคำสั่งอื่นๆ
 * ของโปรเจกต์ Price Alert ไว้ในที่เดียว
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

// สี
const colors = {
  info: chalk.blue,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  heading: chalk.cyan.bold,
  highlight: chalk.magenta
};

const isWindows = os.platform() === 'win32';
const rootDir = path.resolve(__dirname);
const portableDir = path.join(rootDir, 'portable-env');
const localEnvDir = path.join(rootDir, 'local-env');

/**
 * แสดงหน้าแรกของ CLI
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
  console.log(colors.info('ระบบจัดการบอทแจ้งเตือนราคาคริปโตเคอเรนซี - เครื่องมือบรรทัดคำสั่งกลาง'));
  console.log(colors.info('เวอร์ชัน 1.0.0'));
  console.log(colors.info('======================================================\n'));
}

/**
 * รันคำสั่งในเทอร์มินัล
 * @param {string} command - คำสั่งที่จะรัน
 * @param {Array<string>} args - อาร์กิวเมนต์สำหรับคำสั่ง
 * @param {Object} options - ตัวเลือกสำหรับการรันคำสั่ง
 * @returns {Promise<{stdout: string, stderr: string}>} - Promise พร้อมผลลัพธ์
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(colors.info(`กำลังรัน: ${command} ${args.join(' ')}`));
    
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
        reject(new Error(`คำสั่ง ${command} ล้มเหลวด้วยรหัส ${code}`));
      }
    });
    
    proc.on('error', err => {
      reject(new Error(`เกิดข้อผิดพลาดในการรันคำสั่ง: ${err.message}`));
    });
  });
}

/**
 * ตรวจสอบว่าเป็นผู้ใช้ที่มีสิทธิ์เป็น Administrator หรือ root หรือไม่
 * @returns {boolean} - true ถ้าเป็น admin, false ถ้าไม่ใช่
 */
function checkIsAdmin() {
  try {
    if (isWindows) {
      // ตรวจสอบว่าใช้สิทธิ์ Admin หรือไม่บน Windows
      const { status } = spawnSync('net', ['session'], { stdio: ['ignore', 'ignore', 'ignore'] });
      return status === 0;
    } else {
      // ตรวจสอบว่าใช้สิทธิ์ root หรือไม่บน Unix
      return process.getuid && process.getuid() === 0;
    }
  } catch (err) {
    return false;
  }
}

/**
 * จัดการการติดตั้ง Node modules
 */
async function installDependencies() {
  const spinner = ora('กำลังติดตั้งแพ็กเกจที่จำเป็น...').start();
  try {
    await runCommand('npm', ['install'], { silent: true });
    spinner.succeed('ติดตั้งแพ็กเกจเสร็จสมบูรณ์');
  } catch (error) {
    spinner.fail(`ติดตั้งแพ็กเกจล้มเหลว: ${error.message}`);
  }
}

/**
 * ตรวจสอบสถานะของบริการ Redis และ PostgreSQL
 */
async function checkServicesStatus() {
  console.log(colors.heading('\nสถานะบริการ:'));

  // ตรวจสอบว่าติดตั้งสภาพแวดล้อมแบบใดแล้วบ้าง
  const hasPortableEnv = fs.existsSync(portableDir);
  const hasLocalEnv = fs.existsSync(localEnvDir);

  if (hasPortableEnv) {
    console.log(colors.info('สภาพแวดล้อมแบบพกพา:'));
    await runNodeScript('scripts/portable-env.js', ['status']);
  }

  if (hasLocalEnv) {
    console.log(colors.info('\nสภาพแวดล้อมแบบติดตั้งในเครื่อง:'));
    await runNodeScript('scripts/verify-installation.js');
  }
  
  if (!hasPortableEnv && !hasLocalEnv) {
    console.log(colors.warning('ยังไม่ได้ติดตั้งสภาพแวดล้อมใดๆ กรุณาใช้คำสั่ง setup'));
  }
}

/**
 * รันสคริปต์ Node.js
 * @param {string} scriptPath - พาธของสคริปต์
 * @param {Array<string>} args - อาร์กิวเมนต์
 */
async function runNodeScript(scriptPath, args = []) {
  try {
    await runCommand('node', [scriptPath, ...args]);
  } catch (error) {
    console.error(colors.error(`เกิดข้อผิดพลาดในการรันสคริปต์ ${scriptPath}: ${error.message}`));
  }
}

/**
 * สร้าง .env file หากยังไม่มี
 */
async function createEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'telegramToken',
        message: 'Telegram Bot Token (ได้จาก @BotFather):',
        default: 'your_telegram_bot_token'
      },
      {
        type: 'input',
        name: 'port',
        message: 'พอร์ตที่ต้องการให้แอพทำงาน:',
        default: '3000',
        validate: (input) => {
          const port = parseInt(input);
          if (isNaN(port) || port < 1 || port > 65535) {
            return 'กรุณาระบุพอร์ตระหว่าง 1-65535';
          }
          return true;
        }
      }
    ]);

    const envContent = `# การกำหนดค่าแอปพลิเคชัน
NODE_ENV=development
PORT=${answers.port}
LOG_LEVEL=debug

# การกำหนดค่าฐานข้อมูล (แบบติดตั้งในเครื่อง)
DATABASE_URL=postgres://postgres:password@localhost:5432/price_alert_db

# การกำหนดค่า Redis (แบบติดตั้งในเครื่อง)
REDIS_URL=redis://localhost:6379

# การกำหนดค่าฐานข้อมูล (แบบพกพา)
# DATABASE_URL=postgres://postgres:password@localhost:5433/price_alert_db

# การกำหนดค่า Redis (แบบพกพา)
# REDIS_URL=redis://localhost:6380

# ตั้งค่า Telegram Bot Token
TELEGRAM_BOT_TOKEN=${answers.telegramToken}
`;

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(colors.success('\nสร้างไฟล์ .env เสร็จเรียบร้อย'));
  } else {
    console.log(colors.info('\nไฟล์ .env มีอยู่แล้ว'));
  }
}

/**
 * แสดงหน้าจอช่วยเหลือแบบละเอียด
 */
function showDetailedHelp() {
  console.clear();
  displayBanner();
  
  console.log(colors.heading('วิธีใช้งาน PriceAlert CLI:'));
  console.log(`
${colors.highlight('การติดตั้ง:')}
  ${colors.success('setup')}             - ช่วยคุณตัดสินใจเลือกวิธีติดตั้งที่เหมาะสม
  ${colors.success('setup:local')}       - ติดตั้งสภาพแวดล้อม Redis และ PostgreSQL ลงในเครื่อง
  ${colors.success('setup:portable')}    - ติดตั้งสภาพแวดล้อมแบบพกพา (ไม่ต้องการสิทธิ์ admin)

${colors.highlight('การรันแอปพลิเคชัน:')}
  ${colors.success('start')}             - เริ่มแอปพลิเคชัน (โหมดผลิต)
  ${colors.success('dev')}               - เริ่มแอปพลิเคชันในโหมดพัฒนา (พร้อม nodemon)

${colors.highlight('การจัดการบริการ:')}
  ${colors.success('services')}          - แสดงสถานะบริการทั้งหมด
  ${colors.success('services:start')}    - เริ่มบริการตามที่ติดตั้งไว้ (อัตโนมัติ)
  ${colors.success('services:stop')}     - หยุดบริการทั้งหมด

${colors.highlight('แบบพกพา:')}
  ${colors.success('portable:start')}    - เริ่มบริการแบบพกพา
  ${colors.success('portable:stop')}     - หยุดบริการแบบพกพา
  ${colors.success('portable:verify')}   - ตรวจสอบการติดตั้งแบบพกพา

${colors.highlight('เครื่องมืออื่นๆ:')}
  ${colors.success('test')}              - รันการทดสอบทั้งหมด
  ${colors.success('logs')}              - แสดงไฟล์บันทึกเหตุการณ์
  ${colors.success('clean')}             - ล้างไฟล์ที่ไม่จำเป็นและไฟล์ชั่วคราว
  ${colors.success('db:reset')}          - รีเซ็ตฐานข้อมูลและนำเข้าสคีมา
  ${colors.success('info')}              - แสดงข้อมูลเกี่ยวกับโครงการ

${colors.highlight('เพิ่มเติม:')}
  ${colors.success('--help')}            - แสดงวิธีใช้งานโดยละเอียด
  
  `);
}

/**
 * แสดงข้อมูลของโครงการ
 */
async function showProjectInfo() {
  const packageJsonPath = path.join(rootDir, 'package.json');
  let packageInfo = {};
  
  try {
    const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
    packageInfo = JSON.parse(packageContent);
  } catch (error) {
    console.error(colors.error(`ไม่สามารถอ่านไฟล์ package.json: ${error.message}`));
  }
  
  console.log(colors.heading('\nข้อมูลโครงการ:'));
  console.log(colors.info(`ชื่อโครงการ: ${packageInfo.name || 'price-alert'}`));
  console.log(colors.info(`เวอร์ชัน: ${packageInfo.version || '1.0.0'}`));
  console.log(colors.info(`คำอธิบาย: ${packageInfo.description || 'Crypto Price Alert Telegram Bot'}`));
  
  console.log(colors.heading('\nสภาพแวดล้อมระบบ:'));
  console.log(colors.info(`Node.js: ${process.version}`));
  console.log(colors.info(`ระบบปฏิบัติการ: ${os.platform()} ${os.release()}`));
  console.log(colors.info(`สถาปัตยกรรม: ${os.arch()}`));
  console.log(colors.info(`หน่วยความจำ (ทั้งหมด): ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`));
  
  console.log(colors.heading('\nไฟล์กำหนดค่า:'));
  const envExists = fs.existsSync(path.join(rootDir, '.env'));
  console.log(colors.info(`.env file: ${envExists ? 'มี' : 'ไม่มี'}`));
  
  // สแกนหาบริการที่ติดตั้ง
  console.log(colors.heading('\nสภาพแวดล้อมที่ติดตั้ง:'));
  const hasPortableEnv = fs.existsSync(portableDir);
  const hasLocalEnv = fs.existsSync(localEnvDir);
  
  console.log(colors.info(`แบบพกพา: ${hasPortableEnv ? 'ติดตั้งแล้ว' : 'ไม่ได้ติดตั้ง'}`));
  console.log(colors.info(`แบบติดตั้งในระบบ: ${hasLocalEnv ? 'ติดตั้งแล้ว' : 'ไม่ได้ติดตั้ง'}`));
  
  // จำนวนไฟล์
  console.log(colors.heading('\nสถิติโครงการ:'));
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

// กำหนด CLI
displayBanner();
program.version('1.0.0');

// คำสั่งหลัก
program
  .command('setup')
  .description('ตัวช่วยติดตั้งสภาพแวดล้อม')
  .action(setupWizard);

program
  .command('setup:local')
  .description('ติดตั้งสภาพแวดล้อมแบบในระบบ')
  .action(() => runNodeScript('scripts/setup-local.js'));

program
  .command('setup:portable')
  .description('ติดตั้งสภาพแวดล้อมแบบพกพา')
  .action(() => runNodeScript('scripts/portable-env.js', ['install']));

program
  .command('services')
  .description('แสดงสถานะของบริการ')
  .action(checkServicesStatus);

program
  .command('services:start')
  .description('เริ่มบริการทั้งหมด')
  .action(startServices);

program
  .command('services:stop')
  .description('หยุดบริการทั้งหมด')
  .action(stopServices);

program
  .command('start')
  .description('เริ่มแอปพลิเคชัน (โหมดผลิต)')
  .action(() => startApp(false));

program
  .command('dev')
  .description('เริ่มแอปพลิเคชันในโหมดพัฒนา')
  .action(() => startApp(true));

program
  .command('test')
  .description('รันการทดสอบทั้งหมด')
  .action(() => runCommand('npm', ['test']));

program
  .command('portable:start')
  .description('เริ่มบริการแบบพกพา')
  .action(() => runNodeScript('scripts/portable-env.js', ['start']));

program
  .command('portable:stop')
  .description('หยุดบริการแบบพกพา')
  .action(() => runNodeScript('scripts/portable-env.js', ['stop']));

program
  .command('portable:verify')
  .description('ตรวจสอบการติดตั้งแบบพกพา')
  .action(() => runNodeScript('scripts/verify-portable.js'));

program
  .command('logs')
  .description('แสดงไฟล์บันทึกเหตุการณ์')
  .action(showLogs);

program
  .command('clean')
  .description('ทำความสะอาดไฟล์ที่ไม่จำเป็น')
  .action(cleanProject);

program
  .command('db:reset')
  .description('รีเซ็ตฐานข้อมูลและนำเข้าสคีมา')
  .action(resetDatabase);

program
  .command('info')
  .description('แสดงข้อมูลเกี่ยวกับโครงการ')
  .action(showProjectInfo);

program
  .command('help')
  .description('แสดงวิธีใช้งานโดยละเอียด')
  .action(showDetailedHelp);

// ถ้าไม่มีคำสั่งถูกระบุ แสดงความช่วยเหลือ
if (process.argv.length <= 2) {
  showDetailedHelp();
}

program.parse(process.argv);

