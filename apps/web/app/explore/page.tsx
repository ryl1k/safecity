import { redirect } from 'next/navigation';

// The full-screen experience now lives at /map. Keep this path working for old links.
export default function ExploreRedirect() {
  redirect('/map');
}
