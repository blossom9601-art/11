import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from '../auth/AuthContext';

export default function LoginScreen() {
  const { login, serverUrl } = useAuth();
  const [server, setServer] = useState(serverUrl || Constants.expoConfig?.extra?.defaultServerUrl || '');
  const [empNo, setEmpNo] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    setError(''); setBusy(true);
    try {
      await login(server, empNo, password);
    } catch (e) {
      setError('로그인 실패: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={s.brand}>Blossom</Text>
      <Text style={s.subtitle}>사내 메신저</Text>

      <Text style={s.label}>서버 주소</Text>
      <TextInput
        style={s.input} value={server} onChangeText={setServer}
        placeholder="https://blossom.example.com" placeholderTextColor="#475569"
        autoCapitalize="none" autoCorrect={false} keyboardType="url"
      />
      <Text style={s.label}>사번</Text>
      <TextInput
        style={s.input} value={empNo} onChangeText={setEmpNo}
        autoCapitalize="none" autoCorrect={false} placeholder="사번"
        placeholderTextColor="#475569" textContentType="username"
      />
      <Text style={s.label}>비밀번호</Text>
      <TextInput
        style={s.input} value={password} onChangeText={setPassword}
        secureTextEntry placeholder="비밀번호" placeholderTextColor="#475569"
        textContentType="password"
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <TouchableOpacity style={s.btn} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>로그인</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0f172a' },
  brand: { fontSize: 32, fontWeight: '700', color: '#f1f5f9', textAlign: 'center' },
  subtitle: { color: '#94a3b8', textAlign: 'center', marginBottom: 28 },
  label: { color: '#cbd5e1', marginTop: 12, marginBottom: 4, fontSize: 13 },
  input: {
    backgroundColor: '#1e293b', color: '#f1f5f9',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#334155',
  },
  btn: {
    marginTop: 24, backgroundColor: '#38bdf8',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  error: { color: '#fca5a5', marginTop: 12, textAlign: 'center' },
});
