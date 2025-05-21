/**
 * Portable Environment Setup
 * 
 * This script handles downloading and extracting the portable
 * Redis and PostgreSQL binaries for the Price Alert application.
 * It replaces the PowerShell-based setup with a Node.js solution.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const { createWriteStream, existsSync, mkdirSync } = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);

const rootDir = path.resolve(__dirname, '..');
const portableDirName = 'portable-env';
const portableDir = path.join(rootDir, portableDirName);

/**
 * รันคำสั่งในเทอร์มินัล
 * @param {string} command - คำสั่งที่จะรัน
 * @param {Array<string>} args - อาร์กิวเมนต์สำหรับคำสั่ง
 * @param {Object} options - ตัวเลือกสำหรับการรันคำสั่ง
 * @returns {Promise<{stdout: string, stderr: string}>} - Promise พร้อมผลลัพธ์
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`กำลังรัน: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      stdio: 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

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
 * ติดตั้งสภาพแวดล้อมพกพาหากยังไม่ได้ติดตั้ง
 */
async function installPortableEnvIfNeeded() {
  if (!fs.existsSync(portableDir)) {
    console.log('กำลังติดตั้งสภาพแวดล้อมพกพา...');
    
    if (isWindows) {
      const scriptPath = path.join(rootDir, 'portable-env.ps1');
      
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`ไม่พบสคริปท์ portable-env.ps1 ในไดเรกทอรี ${rootDir}`);
      }
      
      await runCommand('powershell', [
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath
      ]);
    } else {
      const scriptPath = path.join(rootDir, 'portable-env.sh');
      
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`ไม่พบสคริปท์ portable-env.sh ในไดเรกทอรี ${rootDir}`);
      }
        // ให้สิทธิ์การรันสคริปท์
      require('child_process').spawnSync('chmod', ['+x', scriptPath]);
      
      await runCommand(scriptPath, []);
    }
    
    console.log('ติดตั้งสภาพแวดล้อมพกพาเสร็จเรียบร้อย');
  } else {
    console.log('สภาพแวดล้อมพกพาถูกติดตั้งไว้แล้ว');
  }
}

/**
 * เริ่มบริการ Redis และ PostgreSQL ในรูปแบบพกพา
 */
async function startServices() {
  await installPortableEnvIfNeeded();
  
  const startScript = isWindows 
    ? path.join(portableDir, 'start-services.ps1')
    : path.join(portableDir, 'start-services.sh');
    
  if (!fs.existsSync(startScript)) {
    throw new Error(`ไม่พบสคริปท์เริ่มบริการ: ${startScript}`);
  }
  
  console.log('กำลังเริ่มบริการ Redis และ PostgreSQL แบบพกพา...');
  
  if (isWindows) {
    await runCommand('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-File', startScript
    ]);
  } else {    // ให้สิทธิ์การรันสคริปท์หากจำเป็น
    if (!fs.statSync(startScript).mode & 0o111) {
      require('child_process').spawnSync('chmod', ['+x', startScript]);
    }
    
    await runCommand(startScript, []);
  }
}

/**
 * หยุดบริการ Redis และ PostgreSQL ในรูปแบบพกพา
 */
async function stopServices() {
  const stopScript = isWindows 
    ? path.join(portableDir, 'stop-services.ps1')
    : path.join(portableDir, 'stop-services.sh');
    
  if (!fs.existsSync(stopScript)) {
    throw new Error(`ไม่พบสคริปท์หยุดบริการ: ${stopScript}`);
  }
  
  console.log('กำลังหยุดบริการ Redis และ PostgreSQL แบบพกพา...');
  
  if (isWindows) {
    await runCommand('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-File', stopScript
    ]);
  } else {    // ให้สิทธิ์การรันสคริปท์หากจำเป็น
    if (!fs.statSync(stopScript).mode & 0o111) {
      require('child_process').spawnSync('chmod', ['+x', stopScript]);
    }
    
    await runCommand(stopScript, []);
  }
}

/**
 * ตรวจสอบสถานะของบริการ Redis และ PostgreSQL
 */
async function checkStatus() {
  // ตรวจสอบว่าติดตั้งสภาพแวดล้อมพกพาแล้วหรือไม่
  if (!fs.existsSync(portableDir)) {
    console.log('ยังไม่ได้ติดตั้งสภาพแวดล้อมพกพา กรุณาใช้คำสั่ง "npm run portable:install" ก่อน');
    return;
  }
  
  console.log('กำลังตรวจสอบสถานะบริการ...');
    // ตรวจสอบสถานะ Redis (พอร์ต 6380)
  let redisRunning = false;
  try {
    let netstat;
    if (isWindows) {
      netstat = require('child_process').spawnSync('netstat', ['-an']);
    } else {
      netstat = require('child_process').spawnSync('lsof', ['-i', ':6380']);
    }
    
    const output = netstat.stdout ? netstat.stdout.toString() : '';
    redisRunning = output.includes(isWindows ? '127.0.0.1:6380' : 'TCP *:6380');
  } catch (error) {
    console.error('ไม่สามารถตรวจสอบสถานะ Redis:', error.message);
  }
  
  // ตรวจสอบสถานะ PostgreSQL (พอร์ต 5433)
  let pgRunning = false;
  try {
    let netstat;
    if (isWindows) {
      netstat = require('child_process').spawnSync('netstat', ['-an']);
    } else {
      netstat = require('child_process').spawnSync('lsof', ['-i', ':5433']);
    }
    
    const output = netstat.stdout ? netstat.stdout.toString() : '';
    pgRunning = output.includes(isWindows ? '127.0.0.1:5433' : 'TCP *:5433');
  } catch (error) {
    console.error('ไม่สามารถตรวจสอบสถานะ PostgreSQL:', error.message);
  }
  
  console.log('สถานะบริการพกพา:');
  console.log(`Redis: ${redisRunning ? 'กำลังทำงาน' : 'ไม่ได้ทำงาน'} (localhost:6380)`);
  console.log(`PostgreSQL: ${pgRunning ? 'กำลังทำงาน' : 'ไม่ได้ทำงาน'} (localhost:5433)`);
  
  return { redisRunning, pgRunning };
}

/**
 * แสดงการใช้งานและคำสั่งที่รองรับ
 */
function showHelp() {
  console.log('การใช้งาน: npm run portable [คำสั่ง]');
  console.log('คำสั่งที่รองรับ:');
  console.log('  install - ติดตั้งสภาพแวดล้อมพกพา');
  console.log('  start   - เริ่มบริการ Redis และ PostgreSQL แบบพกพา');
  console.log('  stop    - หยุดบริการ Redis และ PostgreSQL แบบพกพา');
  console.log('  status  - ตรวจสอบสถานะของบริการ');
  console.log('  help    - แสดงข้อมูลนี้');
}

/**
 * ฟังก์ชั่นหลัก
 */
async function main() {
  try {
    // รับคำสั่งจากอาร์กิวเมนต์บรรทัดคำสั่ง
    const command = process.argv[2] || 'help';
    
    switch (command) {
      case 'install':
        await installPortableEnvIfNeeded();
        break;
      case 'start':
        await startServices();
        break;
      case 'stop':
        await stopServices();
        break;
      case 'status':
        await checkStatus();
        break;
      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error.message);
    process.exit(1);
  }
}

// เริ่มทำงาน
main();
