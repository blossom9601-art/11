/**
 * Fetches PuTTY (64-bit Windows) into resources/putty/putty.exe for electron-builder extraResources.
 * Source: Simon Tatham PuTTY — https://www.chiark.greenend.org.uk/~sgtatham/putty/
 * License: MIT (see resources/putty/LICENSE.txt)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const PUTTY_URL = 'https://the.earth.li/~sgtatham/putty/latest/w64/putty.exe';
const PLINK_URL = 'https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe';
const PUTTY_DIR = path.join(__dirname, '..', 'resources', 'putty');
const PUTTY_DEST = path.join(PUTTY_DIR, 'putty.exe');
const PLINK_DEST = path.join(PUTTY_DIR, 'plink.exe');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(tmp);
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        file.close();
        fs.unlinkSync(tmp);
        if (!loc) return reject(new Error('redirect without location'));
        return resolve(download(loc.startsWith('http') ? loc : new URL(loc, url).href, dest));
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(tmp); } catch (_) {}
        return reject(new Error('HTTP ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close((err) => {
          if (err) return reject(err);
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
    });
    req.on('error', (e) => {
      try {
        file.close();
        fs.unlinkSync(tmp);
      } catch (_) {}
      reject(e);
    });
  });
}

async function main() {
  const force = process.argv.includes('--force');
  const needPutty = !fs.existsSync(PUTTY_DEST) || force;
  const needPlink = !fs.existsSync(PLINK_DEST) || force;
  if (!needPutty && !needPlink) {
    console.log('[fetch-putty] exists:', PUTTY_DEST, PLINK_DEST);
    return;
  }
  if (needPutty) {
    console.log('[fetch-putty] downloading', PUTTY_URL);
    await download(PUTTY_URL, PUTTY_DEST);
    console.log('[fetch-putty] saved', PUTTY_DEST, '(' + fs.statSync(PUTTY_DEST).size + ' bytes)');
  }
  if (needPlink) {
    console.log('[fetch-putty] downloading', PLINK_URL);
    await download(PLINK_URL, PLINK_DEST);
    console.log('[fetch-putty] saved', PLINK_DEST, '(' + fs.statSync(PLINK_DEST).size + ' bytes)');
  }
}

main().catch((err) => {
  console.error('[fetch-putty]', err);
  process.exit(1);
});
