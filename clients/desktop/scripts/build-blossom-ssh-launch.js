/**
 * Builds resources/putty/BlossomSshLaunch.exe via bundled .NET Framework csc (Windows).
 * WinExe, no console — protocol handler shows this EXE instead of PowerShell in the browser prompt.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const windir = process.env.WINDIR || 'C:\\Windows';
const csc = path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const src = path.join(__dirname, '..', 'native', 'BlossomSshLaunch', 'Program.cs');
const out = path.join(__dirname, '..', 'resources', 'putty', 'BlossomSshLaunch.exe');

function main() {
  if (process.platform !== 'win32') {
    console.error('[blossom-ssh-launch] Windows only (csc.exe). Commit BlossomSshLaunch.exe or build on Windows.');
    process.exit(1);
  }
  if (!fs.existsSync(csc)) {
    console.error('[blossom-ssh-launch] missing:', csc);
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error('[blossom-ssh-launch] missing source:', src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync(
    csc,
    ['/nologo', '/target:winexe', '/optimize+', `/out:${out}`, src],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) {
    process.exit(typeof r.status === 'number' ? r.status : 1);
  }
  console.log('[blossom-ssh-launch] ok', out);
}

main();
