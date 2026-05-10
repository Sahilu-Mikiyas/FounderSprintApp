import { Tabs } from 'expo-router';
import { colors } from '../../lib/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(8,8,8,0.96)',
          borderTopColor: '#161616',
          height: 84,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color }) => <TabIcon emoji="🎯" color={color} /> }} />
      <Tabs.Screen name="sprint" options={{ title: 'Sprint', tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} /> }} />
      <Tabs.Screen name="kpis" options={{ title: 'KPIs', tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} /> }} />
      <Tabs.Screen name="pipeline" options={{ title: 'Pipeline', tabBarIcon: ({ color }) => <TabIcon emoji="🔥" color={color} /> }} />
      <Tabs.Screen name="revenue" options={{ title: 'Revenue', tabBarIcon: ({ color }) => <TabIcon emoji="💰" color={color} /> }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: ({ color }) => <TabIcon emoji="🏆" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, opacity: color === '#444' ? 0.4 : 1 }}>{emoji}</Text>;
}
