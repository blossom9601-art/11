/* Blossom Chat — SSH: 비밀번호는 PuTTY GUI + -pwfile(터미널 퀄리티). Plink는 번들만 유지 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

function getPuttyPath() {
  const bundled = path.join(process.resourcesPath, 'putty', 'putty.exe');
  if (fs.existsSync(bundled)) return bundled;
  if (process.platform !== 'win32') return null;
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  for (const p of [
    path.join(pf, 'PuTTY', 'putty.exe'),
    path.join(pfx86, 'PuTTY', 'putty.exe'),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getPlinkPath() {
  const bundled = path.join(process.resourcesPath, 'putty', 'plink.exe');
  if (fs.existsSync(bundled)) return bundled;
  if (process.platform !== 'win32') return null;
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  for (const p of [
    path.join(pf, 'PuTTY', 'plink.exe'),
    path.join(pfx86, 'PuTTY', 'plink.exe'),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 비대화형 인증 시도(배치). 성공 시에만 PuTTY 실행 — 비밀번호 오류 시 감사 "실패"에 쓸 수 있음 */
function verifySshPasswordWithPlink(host, portNum, userStr, pwStr) {
  const plink = getPlinkPath();
  if (!plink || !pwStr) {
    return { ok: true, skipped: true };
  }
  let pwfile = null;
  try {
    pwfile = path.join(os.tmpdir(), `blossom-plink-pw-${crypto.randomBytes(8).toString('hex')}.txt`);
    fs.writeFileSync(pwfile, `${pwStr}\n`, { encoding: 'utf8' });
  } catch (e) {
    return { ok: true, skipped: true };
  }
  const pwfileNorm = pwfile.replace(/\\/g, '/');
  const args = ['-batch', '-ssh'];
  if (userStr) {
    args.push('-l', userStr);
  }
  args.push('-P', String(portNum));
  args.push('-pwfile', pwfileNorm, host, 'echo', 'blossom_ssh_ok');
  let errText = '';
  try {
    execFileSync(plink, args, {
      timeout: 25000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true };
  } catch (e) {
    errText = `${e.stderr || ''}${e.stdout || ''}${e.message || ''}`;
    if (/unknown option|unrecognised option|unrecognized option|bad option/i.test(errText)) {
      return { ok: true, skipped: true };
    }
    if (/The host key is not cached|cannot confirm|not trusted|Host key verification failed|host key is not/i.test(errText)) {
      return { ok: true, skipped: true, hostKey: true };
    }
    return { ok: false, error: 'ssh_auth_failed', detail: errText.trim().slice(0, 400) };
  } finally {
    try {
      fs.unlinkSync(pwfile);
    } catch (_) {}
  }
}

function stripWrappingQuotes(s) {
  if (s == null || s === '') return '';
  s = String(s).trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1).trim();
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).trim();
  return s;
}

function normalizeSshUser(raw) {
  let s = raw == null ? '' : String(raw).trim();
  if (!s) return '';
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = stripWrappingQuotes(s);
    if (s.length >= 2 && s[0] === '\u201c' && s[s.length - 1] === '\u201d') s = s.slice(1, -1).trim();
    if (s.length >= 2 && s[0] === '\u2018' && s[s.length - 1] === '\u2019') s = s.slice(1, -1).trim();
  }
  return s;
}

function normalizeSshPassword(raw) {
  let s = raw == null ? '' : String(raw).trim();
  if (!s) return '';
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = stripWrappingQuotes(s);
    if (s.length >= 2 && s[0] === '\u201c' && s[s.length - 1] === '\u201d') s = s.slice(1, -1).trim();
    if (s.length >= 2 && s[0] === '\u2018' && s[s.length - 1] === '\u2019') s = s.slice(1, -1).trim();
  }
  return s;
}

function isSafeSshUser(u) {
  if (u == null || u === '') return true;
  return typeof u === 'string' && u.length <= 128 && /^[a-zA-Z0-9._@\\-]+$/.test(u);
}

/** Plink -pw / 프로세스 목록 노출 가능. 줄바꿈 불가 */
function isSafeSshPassword(p) {
  if (p == null || p === '') return true;
  if (typeof p !== 'string' || p.length > 512 || p.includes('\0')) return false;
  if (p.includes('\n') || p.includes('\r')) return false;
  return true;
}

function isSafeSshHost(host) {
  if (!host || typeof host !== 'string' || host.length > 253) return false;
  if (/[;<>&|"'`$\s\\]/.test(host)) return false;
  return /^[a-zA-Z0-9.\[\]:_%+\-_]+$/.test(host);
}

function parsePort(p) {
  const n = parseInt(String(p == null ? '22' : p), 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) return 22;
  return n;
}

function spawnPuttyInteractive(putty, host, portNum, userStr) {
  const args = buildPuttySshArgs(host, portNum, userStr, null);
  try {
    const child = spawn(putty, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** PuTTY CLI: -P 를 host 앞에 두는 편이 안정적 */
function buildPuttySshArgs(host, portNum, userStr, pwfilePath) {
  const args = ['-ssh'];
  if (portNum !== 22) {
    args.push('-P', String(portNum));
  }
  if (userStr) {
    args.push('-l', userStr);
  }
  args.push(host);
  if (pwfilePath) {
    args.push('-pwfile', pwfilePath);
  }
  return args;
}

function spawnPuttyWithPwfile(putty, host, portNum, userStr, pwStr) {
  let pwfile = null;
  try {
    pwfile = path.join(os.tmpdir(), `blossom-putty-pw-${crypto.randomBytes(8).toString('hex')}.txt`);
    fs.writeFileSync(pwfile, `${pwStr}\n`, { encoding: 'utf8' });
  } catch (e) {
    return { ok: false, error: 'pwfile_write_failed' };
  }
  const args = buildPuttySshArgs(host, portNum, userStr, pwfile.replace(/\\/g, '/'));
  try {
    const child = spawn(putty, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    const f = pwfile;
    setTimeout(() => {
      try {
        fs.unlinkSync(f);
      } catch (_) {}
    }, 15000);
    return { ok: true };
  } catch (e) {
    try {
      fs.unlinkSync(pwfile);
    } catch (_) {}
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function launchPuttyFromParams({ host, port, user, password }) {
  const putty = getPuttyPath();
  if (!putty) {
    return { ok: false, error: 'putty_not_found' };
  }
  if (!isSafeSshHost(host)) {
    return { ok: false, error: 'invalid_host' };
  }
  const portNum = parsePort(port);
  const userRaw = user && String(user).trim() ? normalizeSshUser(String(user)) : '';
  const userStr = userRaw && isSafeSshUser(userRaw) ? userRaw : '';
  const pwStr = password != null && String(password).trim() ? normalizeSshPassword(String(password)) : '';
  if (pwStr && !isSafeSshPassword(pwStr)) {
    return { ok: false, error: 'invalid_password' };
  }

  if (pwStr) {
    const verify = verifySshPasswordWithPlink(host, portNum, userStr, pwStr);
    if (!verify.ok) {
      const inter = spawnPuttyInteractive(putty, host, portNum, userStr);
      if (!inter.ok) {
        return verify;
      }
      return { ok: true, plinkAuthFailed: true, openedInteractive: true };
    }
    return spawnPuttyWithPwfile(putty, host, portNum, userStr, pwStr);
  }

  return spawnPuttyInteractive(putty, host, portNum, userStr);
}

module.exports = {
  getPuttyPath,
  getPlinkPath,
  launchPuttyFromParams,
};
