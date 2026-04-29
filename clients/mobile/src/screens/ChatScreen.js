import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function ChatScreen({ route }) {
  const { conversationId } = route.params || {};
  const { me } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await Api.listMessages(conversationId);
      const rows = data?.rows || data?.messages || [];
      setMessages(rows);
      const last = rows[rows.length - 1];
      if (last?.id) Api.markRead(last.id).catch(() => {});
    } catch (e) {
      console.warn('listMessages failed', e?.message);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
    // 폴링 (SSE는 추후 react-native-sse 통합 시 교체)
    pollRef.current = setInterval(load, 5000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    setText('');
    try {
      await Api.sendMessage(conversationId, v);
      await load();
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (e) {
      console.warn('sendMessage failed', e?.message);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        ref={listRef}
        style={s.list}
        contentContainerStyle={{ padding: 12 }}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
        renderItem={({ item }) => {
          const own = me && item.senderId === me.id;
          const cardType = item.messageType;
          let severity = '';
          try {
            const md = JSON.parse(item.metadataJson || item.metadata_json || '{}');
            severity = md.severity || '';
          } catch (_) {}
          return (
            <View style={[s.bubble, own ? s.own : s.other,
              cardType === 'event_card' && s.cardEvent,
              cardType === 'approval_card' && s.cardApproval,
              severity === 'critical' && s.sevCritical,
              severity === 'warning' && s.sevWarning,
            ]}>
              {!own ? <Text style={s.sender}>{item.senderName || item.sender_name || ('user#' + item.senderId)}</Text> : null}
              <Text style={s.body}>{item.content}</Text>
            </View>
          );
        }}
      />
      <View style={s.composer}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지 입력"
          placeholderTextColor="#475569"
          multiline
        />
        <TouchableOpacity style={s.sendBtn} onPress={send} disabled={busy}>
          <Text style={s.sendText}>전송</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  list: { flex: 1 },
  bubble: {
    padding: 10, borderRadius: 12, marginBottom: 8, maxWidth: '85%',
  },
  own: { backgroundColor: '#1d4ed8', alignSelf: 'flex-end' },
  other: { backgroundColor: '#1e293b', alignSelf: 'flex-start' },
  cardEvent: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  cardApproval: { borderLeftWidth: 4, borderLeftColor: '#10b981' },
  sevCritical: { borderLeftColor: '#ef4444' },
  sevWarning: { borderLeftColor: '#f59e0b' },
  sender: { color: '#94a3b8', fontSize: 11, marginBottom: 2 },
  body: { color: '#f1f5f9', fontSize: 14 },
  composer: {
    flexDirection: 'row', padding: 8, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1e293b', backgroundColor: '#0f172a',
  },
  input: {
    flex: 1, backgroundColor: '#1e293b', color: '#f1f5f9',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    maxHeight: 120,
  },
  sendBtn: {
    marginLeft: 8, backgroundColor: '#38bdf8',
    paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8,
  },
  sendText: { color: '#0f172a', fontWeight: '700' },
});
