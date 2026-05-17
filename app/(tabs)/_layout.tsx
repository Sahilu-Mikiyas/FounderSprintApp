import { Text, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '../../lib/colors';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 19, opacity: color === '#444' ? 0.4 : 1 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(8,8,8,0.96)',
          borderTopColor: '#161616',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 0 : 8,
        },
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600' },
        tabBarItemStyle: { minWidth: 54, paddingHorizontal: 2 },
      }}
    >
      <Tabs.Screen name="today"    options={{ title: 'Today',    tabBarIcon: ({ color }) => <TabIcon emoji="🎯" color={color} /> }} />
      <Tabs.Screen name="sprint"   options={{ title: 'Sprint',   tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} /> }} />
      <Tabs.Screen name="kpis"     options={{ title: 'KPIs',     tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} /> }} />
      <Tabs.Screen name="pipeline" options={{ title: 'Pipeline', tabBarIcon: ({ color }) => <TabIcon emoji="🔥" color={color} /> }} />
      <Tabs.Screen name="revenue"  options={{ title: 'Revenue',  tabBarIcon: ({ color }) => <TabIcon emoji="💰" color={color} /> }} />
      <Tabs.Screen name="goals"    options={{ title: 'Goals',    tabBarIcon: ({ color }) => <TabIcon emoji="🏆" color={color} /> }} />
      <Tabs.Screen name="focus"    options={{ title: 'Focus',    tabBarIcon: ({ color }) => <TabIcon emoji="⚡" color={color} /> }} />
      <Tabs.Screen name="routines" options={{ title: 'Routines', tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} /> }} />
    </Tabs>
  );
}
