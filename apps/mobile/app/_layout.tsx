import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/theme';
import { ProfileProvider } from '@/state/ProfileProvider';
import { CityProvider } from '@/state/CityProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ProfileProvider>
            <CityProvider>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }} />
            </CityProvider>
          </ProfileProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
