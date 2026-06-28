import { Redirect } from 'expo-router';

// Land on the accessible-places list (audio-first friendly). Onboarding spine
// will gate this later per profile.
export default function Index() {
  return <Redirect href="/places" />;
}
