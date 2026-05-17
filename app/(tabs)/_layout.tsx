import { Text, Platform, View, TouchableOpacity, ScrollView } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../../lib/colors';

const TABS = [
  { name: 'today',    title: 'Today',    emoji: '🎯' },
  { name: 'sprint',   title: 'Sprint',   emoji: '📅' },
  { name: 'kpis',     title: 'KPIs',     emoji: '📊' },
  { name: 'pipeline', title: 'Pipeline', emoji: '🔥' },
  { name: 'revenue',  title: 'Revenue',  emoji: '💰' },
  { name: 'goals',    title: 'Goals',    emoji: '🏆' },
  { name: 'focus',    title: 'Focus',    emoji: '⚡' },
  { name: 'routines', title: 'Routines', emoji: '📋' },
  { name: 'settings', title: 'Settings', emoji: '⚙️' },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const barHeight = Platform.OS === 'ios' ? 84 : 72;
  const pbBottom = Platform.OS === 'ios' ? 20 : 8;

  return (
    <View style={{
      height: barHeight,
      backgroundColor: 'rgba(8,8,8,0.97)',
      borderTopWidth: 1,
      borderTopColor: '#161616',
    }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 6,
          paddingBottom: pbBottom,
          paddingTop: 8,
        }}
        style={{ flex: 1 }}
      >
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          return (
            <TouchableOpacity
              key={route.key}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 14,
                minWidth: 58,
                opacity: focused ? 1 : 0.35,
              }}
              onPress={() => {
                if (!focused) navigation.navigate(route.name);
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 19 }}>{tab.emoji}</Text>
              <Text style={{
                fontSize: 9,
                fontWeight: '600',
                color: colors.white,
                marginTop: 3,
                letterSpacing: 0.2,
              }}>
                {tab.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="today" />
      <Tabs.Screen name="sprint" />
      <Tabs.Screen name="kpis" />
      <Tabs.Screen name="pipeline" />
      <Tabs.Screen name="revenue" />
      <Tabs.Screen name="goals" />
      <Tabs.Screen name="focus" />
      <Tabs.Screen name="routines" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
