// Blossom 모바일 — 진입점
import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { registerForPushNotifications } from './src/push/pushService';
import LoginScreen from './src/screens/LoginScreen';
import ConversationListScreen from './src/screens/ConversationListScreen';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { ready, authed } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#e2e8f0',
        contentStyle: { backgroundColor: '#0f172a' },
      }}
    >
      {authed ? (
        <>
          <Stack.Screen name="Conversations" component={ConversationListScreen} options={{ title: 'Blossom' }} />
          <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params?.title || '대화' })} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    // 권한 요청 + 토큰 획득은 로그인 후 호출됨
  }, []);
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
