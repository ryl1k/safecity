import { Tabs } from 'expo-router';
import { useTheme } from '@/theme/theme';

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        headerStyle: { backgroundColor: palette.surface },
        headerTitleStyle: { color: palette.text },
        sceneStyle: { backgroundColor: palette.bg },
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Мапа' }} />
      <Tabs.Screen name="places" options={{ title: 'Місця' }} />
      <Tabs.Screen name="settings" options={{ title: 'Профіль' }} />
    </Tabs>
  );
}
