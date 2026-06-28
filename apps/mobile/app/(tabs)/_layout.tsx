import { Tabs } from 'expo-router';
import { theme } from '@/theme/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        headerStyle: { backgroundColor: theme.surface },
        headerTitleStyle: { color: theme.text },
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Мапа' }} />
      <Tabs.Screen name="places" options={{ title: 'Місця' }} />
    </Tabs>
  );
}
