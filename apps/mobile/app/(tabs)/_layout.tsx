import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, size, focused: isFocused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

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
      <Tabs.Screen
        name="index"
        options={{ title: 'Мапа', tabBarIcon: tabIcon('map', 'map-outline') }}
      />
      <Tabs.Screen
        name="places"
        options={{ title: 'Місця', tabBarIcon: tabIcon('list', 'list-outline') }}
      />
      <Tabs.Screen
        name="civic"
        options={{ title: 'Громада', tabBarIcon: tabIcon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="contribute"
        options={{ title: 'Додати', tabBarIcon: tabIcon('add-circle', 'add-circle-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Профіль', tabBarIcon: tabIcon('person', 'person-outline') }}
      />
    </Tabs>
  );
}
