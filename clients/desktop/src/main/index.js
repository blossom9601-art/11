// Electron main process
const path = require('path');
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeImage, safeStorage, session } = require('electron');
const Store = require('electron-store');

const store = new Store({
  name: 'blossom-desktop',
  defaults: {
    serverUrl: '',
    rememberSession: true,
    notifyOnFocus: false,
    bounds: { width: 1280, height: 820 },
    autoLogin: false,
    savedEmpNo: '',
    savedPasswordEnc: '', // safeStorage 로 암호화된 base64
  },
});

// 사내 자체 서명 인증서 허용 (configured serverUrl + 런타임 등록된 호스트)
function getAllowedHost() {
  try { return new URL(store.get('serverUrl') || '').host; } catch (_) { return ''; }
}
const trustedHosts = new Set();
app.commandLine.appendSwitch('ignore-certificate-errors-spki-list');
app.on('certificate-error', (event, _webContents, url, _error, _cert, callback) => {
  try {
    const host = new URL(url).host;
    if (host === getAllowedHost() || trustedHosts.has(host)) {
      event.preventDefault();
      callback(true);
      return;
    }
  } catch (_) {}
  callback(false);
});
ipcMain.handle('net:trust-host', (_e, urlOrHost) => {
  try {
    let host = '';
    if (urlOrHost && /^https?:\/\//i.test(urlOrHost)) host = new URL(urlOrHost).host;
    else host = String(urlOrHost || '').trim();
    if (host) trustedHosts.add(host);
    return true;
  } catch (_) { return false; }
});
ipcMain.handle('preview:fetch-array-buffer', async (_e, rawUrl) => {
  const url = String(rawUrl || '').trim();
  let parsed;
  try { parsed = new URL(url); } catch (_) { return { ok: false, status: 400, error: 'invalid_url' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, status: 400, error: 'unsupported_protocol' };
  }
  try {
    const res = await session.defaultSession.fetch(url, { cache: 'no-store' });
    const ab = await res.arrayBuffer();
    return {
      ok: res.ok,
      status: res.status,
      mime: res.headers.get('content-type') || '',
      buffer: ab,
    };
  } catch (e) {
    return { ok: false, status: 0, error: String((e && e.message) || e) };
  }
});

let mainWindow = null;
let tray = null;
let isQuitting = false;

function getAppIconPath() {
  const buildDir = path.join(__dirname, '..', '..', 'build');
  return path.join(buildDir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function createWindow() {
  const bounds = store.get('bounds');
  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Blossom Chat',
    icon: getAppIconPath(),
    backgroundColor: '#4F46E5',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#4F46E5',
      symbolColor: '#FFFFFF',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));

  // v0.4.54: DevTools 자동 오픈 제거 — BLOSSOM_DEV=1 일 때만 열음
  if (process.env.BLOSSOM_DEV === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 창 크기 저장
  mainWindow.on('close', (e) => {
    if (!isQuitting && store.get('minimizeToTray') !== false) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    const b = mainWindow.getBounds();
    store.set('bounds', { width: b.width, height: b.height });
  });
}

function createTray() {
  // Windows 트레이는 .ico 가 가장 잘 보이고, 32x32 가 표준 권장 사이즈.
  const icoPath = path.join(__dirname, '..', '..', 'build', 'icon.ico');
  const pngPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
  let icon = nativeImage.createFromPath(icoPath);
  if (icon.isEmpty()) icon = nativeImage.createFromPath(pngPath);
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 32, height: 32 });
  }
  if (icon.isEmpty()) {
    // 16x16 단색 PNG (Blossom sky-blue) fallback
    const PNG_16x16 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR4nO3OMQEAAAjDMOZf9' +
      'GHADRJI1XaiqlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlr+sOEDM5sBzO0o7OAAAAAASUVORK5CYII=',
      'base64'
    );
    icon = nativeImage.createFromBuffer(PNG_16x16);
  }
  try {
    tray = new Tray(icon);
  } catch (e) {
    console.warn('[tray] failed to create:', e.message);
    return;
  }
  tray.setToolTip('Blossom Chat');
  const menu = Menu.buildFromTemplate([
    { label: '열기', click: () => { mainWindow && mainWindow.show(); } },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); if (mainWindow.setSkipTaskbar) mainWindow.setSkipTaskbar(false); } });
}

// ── IPC ──
ipcMain.handle('settings:get', (_e, key) => store.get(key));
ipcMain.handle('settings:set', (_e, key, value) => store.set(key, value));

// 자격증명 안전 저장 (OS 키체인 기반 safeStorage)
ipcMain.handle('credentials:save', (_e, { empNo, password }) => {
  if (!empNo || !password) return false;
  if (!safeStorage.isEncryptionAvailable()) {
    // 암호화 불가 환경에서는 저장 거부 (평문 저장 금지)
    return false;
  }
  const enc = safeStorage.encryptString(String(password)).toString('base64');
  store.set('savedEmpNo', String(empNo));
  store.set('savedPasswordEnc', enc);
  store.set('autoLogin', true);
  return true;
});
ipcMain.handle('credentials:load', () => {
  const empNo = store.get('savedEmpNo') || '';
  const encB64 = store.get('savedPasswordEnc') || '';
  if (!empNo || !encB64 || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const password = safeStorage.decryptString(Buffer.from(encB64, 'base64'));
    return { empNo, password, autoLogin: !!store.get('autoLogin') };
  } catch (_) {
    return null;
  }
});
ipcMain.handle('credentials:clear', () => {
  store.set('savedEmpNo', '');
  store.set('savedPasswordEnc', '');
  store.set('autoLogin', false);
  return true;
});

// 앱 잠금 PIN (OS safeStorage, 평문 저장 금지)
ipcMain.handle('security:app-pin-set', (_e, { pin, enable }) => {
  if (enable) {
    if (!/^\d{6}$/.test(String(pin || ''))) return { ok: false, error: 'format' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'no_crypto' };
    try {
      const enc = safeStorage.encryptString(String(pin)).toString('base64');
      store.set('appPinEnc', enc);
      store.set('appPinEnabled', true);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  store.set('appPinEnc', '');
  store.set('appPinEnabled', false);
  return { ok: true };
});
ipcMain.handle('security:app-pin-status', () => {
  return {
    enabled: !!store.get('appPinEnabled'),
    hasPin: !!store.get('appPinEnc'),
    canEncrypt: safeStorage.isEncryptionAvailable(),
  };
});
ipcMain.handle('security:app-pin-verify', (_e, pin) => {
  const encB64 = store.get('appPinEnc') || '';
  if (!store.get('appPinEnabled') || !encB64) return { ok: false, error: 'not_enabled' };
  if (!/^\d{6}$/.test(String(pin || ''))) return { ok: false, error: 'format' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'no_crypto' };
  try {
    const saved = safeStorage.decryptString(Buffer.from(encB64, 'base64'));
    return { ok: String(pin) === String(saved) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// v0.4.33: 모든 데이터/캐시/쿠키 초기화 (재로그인 강제)
ipcMain.handle('app:clear-cache', async () => {
  try {
    await session.defaultSession.clearCache();
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('app:reset-all', async () => {
  try {
    store.clear();
  } catch (_) {}
  try {
    const ses = session.defaultSession;
    await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'shadercache'] });
    await ses.clearCache();
    await ses.clearAuthCache();
  } catch (_) {}
  try { app.relaunch(); } catch (_) {}
  isQuitting = true;
  app.exit(0);
  return true;
});

// 앱 정보
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
    return true;
  }
  return false;
});
ipcMain.handle('app:open-downloads', async () => {
  try {
    const result = await shell.openPath(app.getPath('downloads'));
    return !result;
  } catch (_) {
    return false;
  }
});
// 자동 시작
ipcMain.handle('app:set-auto-start', (_e, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
    return true;
  } catch (_) { return false; }
});
ipcMain.handle('app:get-auto-start', () => {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch (_) { return false; }
});
ipcMain.handle('app:quit', () => {
  isQuitting = true;
  app.quit();
  return true;
});
ipcMain.handle('app:hide-to-tray', () => {
  if (mainWindow) mainWindow.hide();
  if (mainWindow && mainWindow.setSkipTaskbar) mainWindow.setSkipTaskbar(true);
  try {
    if (tray && !store.get('trayBalloonShown')) {
      tray.displayBalloon({
        title: 'Blossom Chat',
        content: '트레이로 이동했습니다. 작업표시줄 우측의 아이콘을 클릭하면 다시 표시됩니다.',
      });
      store.set('trayBalloonShown', true);
    }
  } catch (e) { console.warn('balloon:', e.message); }
  return true;
});

// v0.4.27: 작업표시줄로 최소화 (트레이로 사라지지 않게)
ipcMain.handle('app:minimize', () => {
  if (mainWindow) {
    if (mainWindow.setSkipTaskbar) mainWindow.setSkipTaskbar(false);
    mainWindow.minimize();
  }
  return true;
});

ipcMain.on('notify', (_e, { title, body, conversationId }) => {
  if (!Notification.isSupported()) return;
  const focused = mainWindow && mainWindow.isFocused();
  if (focused && !store.get('notifyOnFocus')) return;
  const soundOff = (store.get('notifySoundId') === 'none') || (store.get('notifySound') === false);
  const n = new Notification({
    title: title || 'Blossom',
    body: body || '',
    silent: !!soundOff,
  });
  n.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('navigate', { conversationId });
    }
  });
  n.show();
});

ipcMain.on('badge:set', (_e, count) => {
  if (typeof app.setBadgeCount === 'function') {
    app.setBadgeCount(count > 0 ? count : 0);
  }
  if (process.platform === 'win32' && mainWindow) {
    mainWindow.setOverlayIcon(null, count > 0 ? String(count) : '');
  }
});

app.whenReady().then(() => {
  // 서버 응답 쿠키의 SameSite=Lax → None;Secure 재작성
  // (renderer가 file:// origin 이라 cross-site로 분류되어 Lax 쿠키가 전송되지 않는 문제 회피)
  try {
    const ses = session.defaultSession;
    const allowedHost = getAllowedHost();
    const filter = allowedHost ? { urls: [`https://${allowedHost}/*`] } : { urls: ['<all_urls>'] };
    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
      const headers = details.responseHeaders || {};
      const key = Object.keys(headers).find((k) => k.toLowerCase() === 'set-cookie');
      if (key) {
        headers[key] = headers[key].map((c) => {
          let nc = c;
          if (/SameSite=/i.test(nc)) {
            nc = nc.replace(/SameSite=\w+/i, 'SameSite=None');
          } else {
            nc = nc + '; SameSite=None';
          }
          if (!/;\s*Secure/i.test(nc)) nc = nc + '; Secure';
          return nc;
        });
      }
      callback({ responseHeaders: headers });
    });
  } catch (e) {
    console.warn('[cookie-rewrite] failed:', e.message);
  }

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 트레이로만 잔류
  }
});
