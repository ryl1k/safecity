import { Redirect } from 'expo-router';
import { useProfile } from '@/state/ProfileProvider';
import { useTheme } from '@/theme/theme';

// Gate: onboarding spine runs once (no needs stored), then into the tabs.
export default function Index() {
  const { ready: profileReady, hasOnboarded } = useProfile();
  const { ready: themeReady } = useTheme();
  if (!profileReady || !themeReady) return null; // brief splash while storage loads
  return <Redirect href={hasOnboarded ? '/places' : '/onboarding'} />;
}
