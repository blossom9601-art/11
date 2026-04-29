import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Api, setServerUrl } from '../api/client';
import { registerForPushNotifications } from '../push/pushService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [me, setMe] = useState(null);
  const [serverUrl, setServerUrlState] = useState('');

  const initialize = useCallback(async () => {
    const stored = (await SecureStore.getItemAsync('server_url')) ||
      Constants.expoConfig?.extra?.defaultServerUrl ||
      '';
    setServerUrlState(stored);
    setServerUrl(stored);

    try {
      const sess = await Api.sessionCheck();
      if (sess && sess.success) {
        setMe(sess.user || sess.profile || null);
        setAuthed(true);
        registerForPushNotifications().catch(() => {});
      }
    } catch (_) {
      // not authed
    }
    setReady(true);
  }, []);

  useEffect(() => { initialize(); }, [initialize]);

  const login = useCallback(async (server, empNo, password) => {
    const url = (server || '').replace(/\/+$/, '');
    setServerUrl(url);
    setServerUrlState(url);
    await SecureStore.setItemAsync('server_url', url);
    const result = await Api.login(empNo, password);
    setMe(result?.user || null);
    setAuthed(true);
    registerForPushNotifications().catch(() => {});
    return result;
  }, []);

  const logout = useCallback(async () => {
    await Api.logout();
    setAuthed(false);
    setMe(null);
  }, []);

  const updateServerUrl = useCallback(async (url) => {
    const u = (url || '').replace(/\/+$/, '');
    setServerUrl(u);
    setServerUrlState(u);
    await SecureStore.setItemAsync('server_url', u);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, authed, me, serverUrl, login, logout, updateServerUrl }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
