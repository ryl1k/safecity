'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';

const STEPS = ['Вітання', 'Доступ'];

export default function OnboardingPage() {
  const router = useRouter();
  const { setPrimary, setNeeds } = useProfile();
  const [step, setStep] = useState(0);

  function finish() {
    // The app is tailored for wheelchair / mobility needs.
    setPrimary('wheelchair');
    setNeeds(['wheelchair']);
    try {
      localStorage.setItem('sc-onboarded', '1');
    } catch {}
    router.push('/map');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5em' }}>
      <div style={{ width: '100%', maxWidth: 'min(100%, 560px)' }}>
        <ol aria-label="Кроки налаштування" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em', listStyle: 'none', padding: 0, margin: '0 0 1.4em' }}>
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} style={{ flex: 1, height: '0.4em', borderRadius: '1em', background: i <= step ? 'var(--sc-primary)' : 'var(--sc-border)' }} />
          ))}
        </ol>

        <div style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1.2em', padding: '1.6em' }}>
          {step === 0 && (
            <Step
              title="Вітаємо у SafeCity"
              desc="Мапа доступних місць для людей на кріслі колісному та з обмеженою мобільністю. Знаходьте місця без бар’єрів і будуйте зручні маршрути."
            >
              <Row>
                <Button onClick={() => setStep(1)}>Почати</Button>
                <Button variant="ghost" onClick={() => router.push('/map')}>Пропустити</Button>
              </Row>
            </Step>
          )}

          {step === 1 && (
            <Step title="Доступ до місцезнаходження" desc="Щоб показувати доступні місця поруч і будувати маршрути, дозвольте доступ до геолокації. Можна зробити це пізніше.">
              <Row>
                <Button onClick={() => { if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.getCurrentPosition(() => finish(), () => finish()); else finish(); }}>
                  Дозволити й завершити
                </Button>
                <Button variant="ghost" onClick={finish}>Пізніше</Button>
              </Row>
            </Step>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ margin: '0 0 0.4em', fontSize: '1.5em', fontWeight: 800 }}>{title}</h1>
      <p style={{ margin: '0 0 1.3em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>{desc}</p>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: '0.7em', flexWrap: 'wrap' }}>{children}</div>;
}
