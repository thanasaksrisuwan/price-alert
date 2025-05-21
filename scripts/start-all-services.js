/**
 * Start All Services
 * 
 * This script launches all required services for the Price Alert application.
 * It replaces the PowerShell-based scripts with a Node.js solution.
 */

const spawn = require('cross-spawn');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const chalk = require('chalk');

// Simple logger
const log = {
  info: (msg) => console.log(chalk.blue(`[INFO] ${msg}`)),
  success: (msg) => console.log(chalk.green(`[SUCCESS] ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`[WARNING] ${msg}`)),
  error: (msg) => console.log(chalk.red(`[ERROR] ${msg}`))
};

const isWindows = os.platform() === 'win32';
const rootDir = path.resolve(__dirname, '..');
const portableEnvDir = path.join(rootDir, 'portable-env');
const redisDir = path.join(portableEnvDir, 'redis');
const pgsqlDir = path.join(portableEnvDir, 'pgsql');
const redisServerExe = path.join(redisDir, 'redis-server.exe');
const redisConfigFile = path.join(redisDir, 'redis.portable.conf');
const pgBinDir = path.join(pgsqlDir, 'pgsql', 'bin');
const pgDataDir = path.join(pgsqlDir, 'data');
const pgCtlExe = path.join(pgBinDir, 'pg_ctl.exe');

/**
 * ตรวจสอบว่า Redis กำลังทำงานหรือไม่
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
 * เริ่ม Redis server
 */
async function startRedis() {
  try {
    log.info('กำลังเริ่ม Redis server...');

    // สร้างไดเรกทอรีล็อกถ้ายังไม่มี
    const redisLogsDir = path.join(redisDir, 'logs');
    if (!fs.existsSync(redisLogsDir)) {
      fs.mkdirSync(redisLogsDir, { recursive: true });
    }
    
    if (isWindows) {
      const command = `cd "${redisDir}" && "${redisServerExe}" "${redisConfigFile}"`;
      spawn('cmd.exe', ['/c', command], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
    } else {
      // For non-Windows platforms
      spawn('redis-server', [redisConfigFile], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    }
    
    // รอให้ Redis เริ่มทำงาน
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ตรวจสอบว่า Redis เริ่มทำงานหรือไม่
    const isRunning = await isRedisRunning();
    if (isRunning) {
      log.success('Redis server เริ่มทำงานเรียบร้อยแล้ว');
      return true;
    } else {
      log.error('ไม่สามารถเริ่ม Redis server ได้');
      return false;
    }
  } catch (error) {
    log.error(`เกิดข้อผิดพลาดในการเริ่ม Redis: ${error.message}`);
    return false;
  }
}

/**
 * ตรวจสอบว่า PostgreSQL กำลังทำงานหรือไม่
 */
async function isPgRunning() {
  try {
    // Try connecting to PostgreSQL
    const cmd = isWindows 
      ? `"${path.join(pgBinDir, 'psql.exe')}" -p 5433 -U postgres -c "SELECT 1;" -t`
      : 'psql -p 5433 -U postgres -c "SELECT 1;" -t';
    
    try {
      const { stdout } = await exec(cmd);
      return stdout.trim().includes('1');
    } catch (err) {
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * เริ่ม PostgreSQL server
 */
async function startPostgreSQL() {
  try {
    log.info('กำลังเริ่ม PostgreSQL server...');
    
    if (isWindows) {
      const env = { ...process.env, PGDATA: pgDataDir };
      
      try {
        const command = `"${pgCtlExe}" start -D "${pgDataDir}" -o "-p 5433"`;
        const { stdout } = await exec(command, { env });
        log.info(stdout);
      } catch (err) {
        if (err.stderr && !err.stderr.includes('already running')) {
          log.error(`PostgreSQL startup error: ${err.stderr}`);
          return false;
        }
      }
    } else {
      // For non-Windows platforms
      await exec(`pg_ctl -D ${pgDataDir} -o "-p 5433" start`);
    }
    
    // รอให้ PostgreSQL เริ่มทำงาน
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ตรวจสอบว่า PostgreSQL เริ่มทำงานหรือไม่
    const isRunning = await isPgRunning();
    if (isRunning) {
      log.success('PostgreSQL server เริ่มทำงานเรียบร้อยแล้ว');
      return true;
    } else {
      log.error('ไม่สามารถเริ่ม PostgreSQL server ได้');
      return false;
    }
  } catch (error) {
    log.error(`เกิดข้อผิดพลาดในการเริ่ม PostgreSQL: ${error.message}`);
    return false;
  }
}

/**
 * เริ่มแอปพลิเคชัน
 */
async function startApplication() {
  log.info('กำลังเริ่มแอปพลิเคชัน Crypto Price Alert...');
  
  return new Promise((resolve) => {
    const appProcess = spawn('npm', ['start'], {
      stdio: 'inherit',
      shell: true,
      cwd: rootDir
    });
    
    appProcess.on('close', (code) => {
      if (code !== 0) {
        log.error(`แอปพลิเคชันหยุดทำงานด้วยรหัส ${code}`);
      }
      resolve(code);
    });
    
    process.on('SIGINT', () => {
      log.info('กำลังปิดแอปพลิเคชัน...');
      appProcess.kill('SIGINT');
    });
  });
}

/**
 * ฟังก์ชันหลักที่เริ่มทำงานทั้งหมด
 */
async function main() {
  try {
    log.info('กำลังเริ่มต้นระบบ Crypto Price Alert...');
    
    // ตรวจสอบและเริ่ม Redis
    let redisRunning = await isRedisRunning();
    if (!redisRunning) {
      await startRedis();
    } else {
      log.success('Redis server กำลังทำงานอยู่แล้ว');
    }
    
    // ตรวจสอบอีกครั้งว่า Redis เริ่มทำงานเรียบร้อยหรือไม่
    redisRunning = await isRedisRunning();
    if (!redisRunning) {
      log.error('ไม่สามารถเริ่มการทำงานของ Redis ได้');
      process.exit(1);
    }
    
    // ตรวจสอบและเริ่ม PostgreSQL
    let pgRunning = await isPgRunning();
    if (!pgRunning) {
      await startPostgreSQL();
    } else {
      log.success('PostgreSQL server กำลังทำงานอยู่แล้ว');
    }
    
    // ตรวจสอบอีกครั้งว่า PostgreSQL เริ่มทำงานเรียบร้อยหรือไม่
    pgRunning = await isPgRunning();
    if (!pgRunning) {
      log.error('ไม่สามารถเริ่มการทำงานของ PostgreSQL ได้');
      process.exit(1);
    }
    
    log.success('บริการทั้งหมดพร้อมทำงานแล้ว');
    
    // เริ่มแอปพลิเคชัน
    const exitCode = await startApplication();
    process.exit(exitCode);
  } catch (error) {
    log.error(`เกิดข้อผิดพลาดในการเริ่มต้นระบบ: ${error.message}`);
    process.exit(1);
  }
}

// เริ่มการทำงาน
main();
