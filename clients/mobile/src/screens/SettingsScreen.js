import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';

export default function SettingsScreen({ navigation }) {
  const { serverUrl, updateServerUrl, logout, me } = useAuth();
  const [server, setServer] = useState(serverUrl || '');

  const onSave = async () => {
    await updateServerUrl(server);
    Alert.alert('저장됨', '서버 주소가 갱신되었습니다.');
  };

  const onLogout = async () => {
    await logout();
  };

  return (
    <View style={s.root}>
      <Text style={s.label}>로그인 사용자</Text>
      <Text style={s.value}>{me?.empNo || me?.emp_no || '—'} {me?.name ? '(' + me.name + ')' : ''}</Text>

      <Text style={[s.label, { marginTop: 18 }]}>서버 주소</Text>
      <TextInput
        style={s.input} value={server} onChangeText={setServer}
        autoCapitalize="none" autoCorrect={false} keyboardType="url"
      />
      <TouchableOpacity style={s.btn} onPress={onSave}>
        <Text style={s.btnText}>저장</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.btn, s.danger]} onPress={onLogout}>
        <Text style={[s.btnText, { color: '#fff' }]}>로그아웃</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20, backgroundColor: '#0f172a' },
  label: { color: '#cbd5e1', fontSize: 13 },
  value: { color: '#f1f5f9', fontSize: 15, marginTop: 4 },
  input: {
    backgroundColor: '#1e293b', color: '#f1f5f9',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#334155', marginTop: 4,
  },
  btn: {
    marginTop: 16, backgroundColor: '#38bdf8',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '700', fontSize: 15 },
  danger: { backgroundColor: '#ef4444' },
});
