import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { Api } from '../api/client';

export default function ConversationListScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await Api.listConversations();
      setRows(data?.rows || data?.conversations || []);
    } catch (e) {
      console.warn('listConversations failed', e?.message);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    // 앱이 포그라운드에 올 때마다 갱신
    const sub = navigation.addListener('focus', load);
    return sub;
  }, [load, navigation]);

  return (
    <FlatList
      style={s.root}
      data={rows}
      keyExtractor={(c) => String(c.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#38bdf8" />}
      ListHeaderComponent={
        <TouchableOpacity style={s.settingsBtn} onPress={() => navigation.navigate('Settings')}>
          <Text style={s.settingsText}>설정 / 로그아웃</Text>
        </TouchableOpacity>
      }
      renderItem={({ item }) => {
        const title = item.title || item.name || ('대화 #' + item.id);
        const isChannel = item.conversationType === 'CHANNEL' || item.type === 'channel';
        const unread = item.unreadCount || item.unread_count || 0;
        return (
          <TouchableOpacity
            style={s.row}
            onPress={() => navigation.navigate('Chat', { conversationId: item.id, title })}
          >
            <Text style={s.title}>{(isChannel ? '# ' : '@ ') + title}</Text>
            {item.lastMessagePreview ? (
              <Text style={s.preview} numberOfLines={1}>{item.lastMessagePreview}</Text>
            ) : null}
            {unread > 0 ? <View style={s.badge}><Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text></View> : null}
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <Text style={s.empty}>대화가 없습니다.</Text>
      }
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  row: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1e293b',
  },
  title: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },
  preview: { color: '#94a3b8', marginTop: 2, fontSize: 13 },
  badge: {
    position: 'absolute', right: 16, top: 14,
    backgroundColor: '#ef4444', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 60 },
  settingsBtn: { padding: 12, alignItems: 'flex-end' },
  settingsText: { color: '#38bdf8' },
});
