/**
 * สคริปท์เริ่มต้นแอปพลิเคชันแบบครบวงจร
 * จะเริ่มการทำงานของ Redis และ PostgreSQL ก่อนเริ่มแอปพลิเคชันหลัก
 */

const spawn = require('cross-spawn');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const chalk = require('chalk');

// สร้างกลไก logger อย่างง่าย
const log = {
  info: (msg) => console.log(chalk.blue(`[INFO] ${msg}`)),
  success: (msg) => console.log(chalk.green(`[SUCCESS] ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`[WARNING] ${msg}`)),
  error: (msg) => console.log(chalk.red(`[ERROR] ${msg}`))
};

const isWindows = os.platform() === 'win32';
const rootDir = path.resolve(__dirname, '..');

/**
 * รันคำสั่ง npm แบบ synchronous
 * @param {string} command - คำสั่ง npm ที่ต้องการรัน
 */
function runNpmCommand(command) {
  log.info(`กำลังรัน: npm ${command}`);
  
  return new Promise((resolve, reject) => {
    const child = spawn('npm', command.split(' '), { 
      stdio: 'inherit',
      shell: true,
      cwd: rootDir 
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}`));
      } else {
        resolve(true);
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`ไม่สามารถรันคำสั่ง npm ${command} ได้: ${err.message}`));
    });
  });
}

/**
 * ตรวจสอบว่า Redis กำลังทำงานหรือไม่
 * @returns {Promise<boolean>} - true หากกำลังทำงาน, false หากไม่ได้ทำงาน
 */
async function isRedisRunning() {
  try {
    if (isWindows) {
      const { stdout } = await exec('powershell -Command "Get-Process -Name redis-server -ErrorAction SilentlyContinue"');
      return stdout.trim().length > 0;
    } else {
      const { stdout } = await exec('pgrep -x redis-server');
      return stdout.trim().length > 0;
    }
  } catch (error) {
    return false;
  }
}

/**
 * ตรวจสอบว่า PostgreSQL กำลังทำงานหรือไม่
 * @returns {Promise<boolean>} - true หากกำลังทำงาน, false หากไม่ได้ทำงาน
 */
async function isPgRunning() {
  try {
    if (isWindows) {
      // Try checking process with wildcard
      const { stdout } = await exec('powershell -Command "Get-Process | Where-Object { $_.ProcessName -like \'postgres*\' }"');
      if (stdout.trim().length > 0) {
        return true;
      }
      
      // Alternative check - try connecting to PostgreSQL
      try {
        const { stdout: pingResult } = await exec('powershell -Command "$env:PGPASSWORD=\'postgres\'; cd portable-env\\pgsql\\pgsql\\bin; .\\psql.exe -p 5433 -U postgres -c \'SELECT 1;\' -t"');
        return pingResult.trim() === '1';
      } catch (connErr) {
        return false;
      }
    } else {
      // Linux/Mac
      const { stdout } = await exec('pgrep -x postgres || pgrep -x postmaster');
      return stdout.trim().length > 0;
    }
  } catch (error) {
    return false;
  }
}

/**
 * ฟังก์ชั่นหลักสำหรับเริ่มต้นการทำงานทั้งหมด
 */
async function startAll() {
  try {
    log.info('กำลังเริ่มต้นระบบ Crypto Price Alert...');
    
    // ตรวจสอบและเริ่ม Redis หากยังไม่ได้เริ่ม
    const redisRunning = await isRedisRunning();
    if (!redisRunning) {
      log.info('Redis ยังไม่เริ่มทำงาน - กำลังเริ่ม...');
      try {
        await runNpmCommand('run portable:start');
        // รอให้ Redis เริ่มทำงาน
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        log.error(`ไม่สามารถเริ่ม Redis ได้: ${err.message}`);
      }
    } else {
      log.success('Redis กำลังทำงานอยู่แล้ว');
    }
    
    // ตรวจสอบอีกครั้งว่า Redis เริ่มทำงานเรียบร้อยหรือไม่
    const redisRunningNow = await isRedisRunning();
    if (!redisRunningNow) {
      log.error('ไม่สามารถเริ่มการทำงานของ Redis ได้');
      process.exit(1);
    }
      // ตรวจสอบและเริ่ม PostgreSQL หากยังไม่ได้เริ่ม
    const pgRunning = await isPgRunning();
    if (!pgRunning) {
      log.info('PostgreSQL ยังไม่เริ่มทำงาน - กำลังเริ่ม...');
      try {
        // ใช้สคริปท์ start-services.ps1 ที่มีอยู่แล้ว
        const startServicesScript = path.join(rootDir, 'portable-env', 'start-services.ps1');
        
        if (isWindows && fs.existsSync(startServicesScript)) {
          log.info(`กำลังรันสคริปท์ ${startServicesScript}`);
          await exec(`powershell -ExecutionPolicy Bypass -File "${startServicesScript}"`);
          log.info('รอให้ PostgreSQL พร้อมทำงาน...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          // Fallback to direct command
          if (isWindows) {
            const pgDataDir = path.join(rootDir, 'portable-env', 'pgsql', 'data');
            log.info(`กำลังเริ่ม PostgreSQL จากไดเรกทอรี ${pgDataDir}`);
            
            try {
              const pgCmd = `cd "${path.join(rootDir, 'portable-env', 'pgsql', 'pgsql', 'bin')}" && set PGDATA="${pgDataDir}" && .\\pg_ctl.exe start -D "${pgDataDir}" -o "-p 5433"`;
              const { stdout } = await exec(pgCmd);
              log.info('PostgreSQL startup output: ' + stdout);
            } catch (pgErr) {
              log.error(`PostgreSQL startup error: ${pgErr.message}`);
              if (pgErr.stdout) log.info('STDOUT: ' + pgErr.stdout);
              if (pgErr.stderr) log.error('STDERR: ' + pgErr.stderr);
            }
          } else {
            await runNpmCommand('run portable:start');
          }
          
          // รอให้ PostgreSQL เริ่มทำงาน
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (err) {
        log.error(`ไม่สามารถเริ่ม PostgreSQL ได้: ${err.message}`);
        if (err.stdout) log.info('STDOUT: ' + err.stdout);
        if (err.stderr) log.error('STDERR: ' + err.stderr);
      }
    } else {
      log.success('PostgreSQL กำลังทำงานอยู่แล้ว');
    }
    
    // ตรวจสอบอีกครั้งว่า PostgreSQL เริ่มทำงานเรียบร้อยหรือไม่
    const pgRunningNow = await isPgRunning();
    if (!pgRunningNow) {
      log.error('ไม่สามารถเริ่มการทำงานของ PostgreSQL ได้');
      process.exit(1);
    }
    
    log.success('ทุกบริการพร้อมทำงานแล้ว');
    
    // เริ่มแอปพลิเคชันหลัก
    log.info('กำลังเริ่มแอปพลิเคชัน Crypto Price Alert...');
    
    // ใช้ spawn เพื่อส่งต่อ stdio
    const appProcess = spawn('npm', ['start'], {
      stdio: 'inherit',
      shell: true,
      cwd: rootDir
    });
    
    appProcess.on('close', (code) => {
      if (code !== 0) {
        log.error(`แอปพลิเคชันหยุดทำงานด้วยรหัส ${code}`);
      }
    });
    
    process.on('SIGINT', () => {
      log.info('กำลังปิดแอปพลิเคชัน...');
      appProcess.kill('SIGINT');
    });
  } catch (error) {
    log.error(`เกิดข้อผิดพลาดในการเริ่มต้นระบบ: ${error.message}`);
    process.exit(1);
  }
}

// เริ่มการทำงาน
startAll();
