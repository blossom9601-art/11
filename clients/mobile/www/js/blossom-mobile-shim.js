// Capacitor 환경에서 window.blossom (Electron preload API) 호환 shim
// Electron preload.js 와 동일한 표면을 제공한다.
(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) {
    // 웹/디버그 모드에서는 localStorage 기반 폴백
  }
  const Prefs = (Cap && Cap.Plugins && Cap.Plugins.Preferences) || null;
  const AppPlugin = (Cap && Cap.Plugins && Cap.Plugins.App) || null;

  function _lsGet(k) { try { const v = localStorage.getItem(k); return v == null ? null : v; } catch (_) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, v == null ? '' : String(v)); } catch (_) {} }

  async function get(key) {
    if (Prefs) { try { const r = await Prefs.get({ key: key }); return _coerce(key, r && r.value); } catch (_) {} }
    return _coerce(key, _lsGet(key));
  }
  async function set(key, value) {
    const s = (value == null) ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
    if (Prefs) { try { await Prefs.set({ key: key, value: s }); return true; } catch (_) {} }
    _lsSet(key, s);
    return true;
  }
  function _coerce(key, raw) {
    if (raw == null || raw === '') {
      // 기본값
      if (key === 'serverUrl') return '';
      if (key === 'rememberSession') return true;
      if (key === 'autoLogin') return false;
      if (key === 'savedEmpNo') return '';
      if (key === 'savedPasswordEnc') return '';
      if (key === 'notifyOnFocus') return false;
      return null;
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }

  // 자격증명: 모바일은 Preferences 만 사용 (보안 keystore 통합은 별도 단계)
  const credentials = {
    async save(empNo, password) {
      await set('savedEmpNo', empNo || '');
      await set('savedPasswordEnc', password || ''); // TODO: SecureStorage 플러그인으로 교체
      await set('autoLogin', 'true');
      return true;
    },
    async load() {
      const empNo = await get('savedEmpNo');
      const password = await get('savedPasswordEnc');
      return { empNo: empNo || '', password: password || '' };
    },
    async clear() {
      await set('savedEmpNo', '');
      await set('savedPasswordEnc', '');
      await set('autoLogin', 'false');
      return true;
    },
  };

  const appApi = {
    async getVersion() {
      if (AppPlugin) { try { const i = await AppPlugin.getInfo(); return i.version; } catch (_) {} }
      return '0.4.49-mobile';
    },
    async openExternal(url) {
      try { window.open(url, '_blank'); } catch (_) {}
      return true;
    },
    async setAutoStart() { return false; },
    async getAutoStart() { return false; },
    async quit() {
      if (AppPlugin && AppPlugin.exitApp) { try { await AppPlugin.exitApp(); } catch (_) {} }
      return true;
    },
    async hideToTray() { return true; },
    async minimize() { return true; },
    async resetAll() {
      try { localStorage.clear(); } catch (_) {}
      if (Prefs) { try { await Prefs.clear(); } catch (_) {} }
      location.reload();
      return true;
    },
  };

  const net = {
    // 모바일 WebView는 자체서명 인증서를 기본 차단. 서버에 정식 인증서가 없는 사내망이면
    // android/app/src/main/res/xml/network_security_config.xml 에서 호스트별 신뢰 추가가 필요.
    async trustHost() { return true; },
  };

  window.blossom = {
    settings: { get: get, set: set },
    credentials: credentials,
    app: appApi,
    net: net,
    notify: function () {},
    badge: function () {},
    onNavigate: function () {},
  };
})();
