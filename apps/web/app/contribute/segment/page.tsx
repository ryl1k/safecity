'use client';

// Adding a pathway now lives in the unified /contribute wizard (step 1 → «Пішохідний
// шлях»). This route is kept as a redirect so old links / dropped-pin deep links
// (?lng=&lat=) keep working.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ContributeSegmentRedirect() {
  const router = useRouter();
  useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(`/contribute${qs}`);
  }, [router]);
  return null;
}
