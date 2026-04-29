// Preload — exposes a minimal, safe API to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blossom', {
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  credentials: {
    save: (empNo, password) => ipcRenderer.invoke('credentials:save', { empNo, password }),
    load: () => ipcRenderer.invoke('credentials:load'),
    clear: () => ipcRenderer.invoke('credentials:clear'),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    setAutoStart: (enabled) => ipcRenderer.invoke('app:set-auto-start', enabled),
    getAutoStart: () => ipcRenderer.invoke('app:get-auto-start'),
    quit: () => ipcRenderer.invoke('app:quit'),
    hideToTray: () => ipcRenderer.invoke('app:hide-to-tray'),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    resetAll: () => ipcRenderer.invoke('app:reset-all'),
    clearCache: () => ipcRenderer.invoke('app:clear-cache'),
    openDownloads: () => ipcRenderer.invoke('app:open-downloads'),
  },
  net: {
    trustHost: (urlOrHost) => ipcRenderer.invoke('net:trust-host', urlOrHost),
  },
  preview: {
    fetchArrayBuffer: (url) => ipcRenderer.invoke('preview:fetch-array-buffer', url),
  },
  security: {
    setAppPin: (o) => ipcRenderer.invoke('security:app-pin-set', o),
    getAppPinStatus: () => ipcRenderer.invoke('security:app-pin-status'),
    verifyAppPin: (pin) => ipcRenderer.invoke('security:app-pin-verify', pin),
  },
  notify: (payload) => ipcRenderer.send('notify', payload),
  badge: (count) => ipcRenderer.send('badge:set', count),
  onNavigate: (cb) => ipcRenderer.on('navigate', (_e, payload) => cb(payload)),
});
