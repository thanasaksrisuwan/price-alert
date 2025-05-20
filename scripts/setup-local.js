/**
 * สคริปท์ช่วยเหลือการติดตั้งสำหรับสภาพแวดล้อมการพัฒนาเฉพาะเครื่อง
 * สคริปท์นี้ตรวจสอบระบบปฏิบัติการและรันสคริปท์ติดตั้งที่เหมาะสม
 */

const spawn = require('cross-spawn');
const path = require('path');
const os = require('os');
const fs = require('fs');

const isWindows = os.platform() === 'win32';
const rootDir = path.resolve(__dirname, '..');

/**
 * รันคำสั่งในเทอร์มินัล
 * @param {string} command - คำสั่งที่จะรัน
 * @param {Array<string>} args - อาร์กิวเมนต์สำหรับคำสั่ง
 * @param {Object} options - ตัวเลือกสำหรับการรันคำสั่ง
 * @returns {Promise<void>} - Promise ที่จะ resolve เมื่อคำสั่งทำงานเสร็จ
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`กำลังรัน: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
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
async function isAdmin() {
  try {
    if (isWindows) {
      // ตรวจสอบว่าใช้สิทธิ์ Admin หรือไม่บน Windows
      const { execSync } = require('child_process');
      const result = execSync('net session', { stdio: ['ignore', 'ignore', 'ignore'] });
      return true;
    } else {
      // ตรวจสอบว่าใช้สิทธิ์ root หรือไม่บน Unix
      return process.getuid && process.getuid() === 0;
    }
  } catch (err) {
    return false;
  }
}

/**
 * เริ่มต้นกระบวนการติดตั้ง
 */
async function setupLocalEnvironment() {
  try {
    console.log('=== เริ่มต้นการติดตั้งสภาพแวดล้อมการพัฒนาเฉพาะเครื่อง ===');

    // ตรวจสอบสิทธิ์การทำงาน
    const admin = await isAdmin();
    if (!admin) {
      console.log('\n⚠️  คำเตือน: คุณไม่ได้รันด้วยสิทธิ์ผู้ดูแลระบบ ⚠️');
      console.log('การติดตั้งบางส่วนอาจล้มเหลวหากไม่มีสิทธิ์เพียงพอ');
      console.log('แนะนำให้รันสคริปท์นี้ด้วยสิทธิ์ผู้ดูแลระบบ (Administrator หรือ root)');
      
      // รอให้ผู้ใช้ยืนยัน
      await new Promise(resolve => {
        console.log('\nกด Enter เพื่อดำเนินการต่อ หรือ Ctrl+C เพื่อยกเลิก...');
        process.stdin.once('data', () => resolve());
      });
    }

    if (isWindows) {
      console.log('ตรวจพบระบบปฏิบัติการ Windows');
      
      // ตรวจสอบว่า PowerShell สามารถรันสคริปท์ได้หรือไม่
      try {
        const scriptPath = path.join(rootDir, 'install-local-env.ps1');
        
        // ตรวจสอบว่าสคริปท์มีอยู่จริง
        if (!fs.existsSync(scriptPath)) {
          throw new Error(`ไม่พบสคริปท์ติดตั้ง: ${scriptPath}`);
        }
        
        // รัน PowerShell script
        await runCommand('powershell', [
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath
        ]);
      } catch (err) {
        console.error('เกิดข้อผิดพลาดในการรันสคริปท์ PowerShell:', err.message);
        process.exit(1);
      }
    } else {
      console.log('ตรวจพบระบบปฏิบัติการ Unix/Linux/macOS');
      
      try {
        const scriptPath = path.join(rootDir, 'install-local-env.sh');
        
        // ตรวจสอบว่าสคริปท์มีอยู่จริง
        if (!fs.existsSync(scriptPath)) {
          throw new Error(`ไม่พบสคริปท์ติดตั้ง: ${scriptPath}`);
        }
        
        // ให้สิทธิ์การรันสคริปท์
        await runCommand('chmod', ['+x', scriptPath]);
        
        // รัน bash script
        await runCommand(scriptPath, []);
      } catch (err) {
        console.error('เกิดข้อผิดพลาดในการรันสคริปท์ bash:', err.message);
        process.exit(1);
      }
    }

    console.log('\n✅ การติดตั้งเสร็จสมบูรณ์');
    console.log('\nคุณสามารถเริ่มต้นแอปพลิเคชันด้วยคำสั่ง:');
    console.log('  npm run dev');
    console.log('\nขอให้สนุกกับการพัฒนา!');
  } catch (error) {
    console.error('เกิดข้อผิดพลาดระหว่างการติดตั้ง:', error.message);
    process.exit(1);
  }
}

// เริ่มต้นติดตั้ง
setupLocalEnvironment();
