'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@safecity/shared';
import { Button, Segmented } from '@/components/ui';
import { FontSizeSlider } from '@/components/FontSizeSlider';
import { useProfile } from '@/profile/ProfileProvider';
import { useTheme } from '@/theme/ThemeProvider';

const STEPS = ['Вітання', 'Потреби', 'Уточнення', 'Вигляд', 'Дозволи'];

export default function OnboardingPage() {
  const router = useRouter();
  const { setPrimary, setNeeds: persistNeeds } = useProfile();
  const { setTheme, setFontScale, fontScale } = useTheme();

  const [step, setStep] = useState(0);
  const [needs, setNeeds] = useState<{ wheelchair: boolean; blind: boolean }>({ wheelchair: false, blind: false });
  const [primary, setPrimaryLocal] = useState<Profile>('wheelchair');
  const [vision, setVision] = useState<'blind' | 'low'>('low');
  const [step1, setStep1] = useState<'yes' | 'no'>('no');

  const chosen = (Object.keys(needs) as Profile[]).filter((k) => needs[k]);
  const canContinue = step !== 1 || chosen.length > 0;

  function toggleNeed(k: Profile) {
    setNeeds((n) => {
      const next = { ...n, [k]: !n[k] };
      const list = (Object.keys(next) as Profile[]).filter((x) => next[x]);
      const first = list[0];
      if (first && !list.includes(primary)) setPrimaryLocal(first);
      return next;
    });
  }

  function finish() {
    setPrimary(primary);
    persistNeeds(chosen);
    // Apply the UI-mode swap from the chosen profile.
    if (chosen.includes('blind')) {
      setTheme('contrast');
      if (vision === 'low' && fontScale < 1.3) setFontScale(1.3);
    }
    try {
      localStorage.setItem('sc-onboarded', '1');
    } catch {}
    router.push('/map');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5em' }}>
      <div style={{ width: '100%', maxWidth: 'min(100%, 560px)' }}>
        {/* Progress */}
        <ol aria-label="Кроки налаштування" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em', listStyle: 'none', padding: 0, margin: '0 0 1.4em' }}>
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} style={{ flex: 1, height: '0.4em', borderRadius: '1em', background: i <= step ? 'var(--sc-primary)' : 'var(--sc-border)' }} />
          ))}
        </ol>

        <div style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1.2em', padding: '1.6em' }}>
          {step === 0 && (
            <Step title="Вітаємо у SafeCity" desc="Налаштуймо застосунок під ваші потреби. Це швидко, і ви завжди зможете змінити це згодом.">
              <Row>
                <Button onClick={() => setStep(1)}>Почати</Button>
                <Button variant="ghost" onClick={() => router.push('/map')}>Пропустити</Button>
              </Row>
            </Step>
          )}

          {step === 1 && (
            <Step title="Які у вас потреби?" desc="Оберіть одне або кілька. Позначений основним визначає вигляд інтерфейсу.">
              <div style={{ display: 'grid', gap: '0.7em' }}>
                <NeedCard label="Крісло колісне та мобільність" picked={needs.wheelchair} primary={primary === 'wheelchair'} onToggle={() => toggleNeed('wheelchair')} onPrimary={() => setPrimaryLocal('wheelchair')} canPrimary={needs.wheelchair} />
                <NeedCard label="Незрячі та слабкозорі" picked={needs.blind} primary={primary === 'blind'} onToggle={() => toggleNeed('blind')} onPrimary={() => setPrimaryLocal('blind')} canPrimary={needs.blind} />
              </div>
              <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!canContinue} />
            </Step>
          )}

          {step === 2 && (
            <Step title="Кілька уточнень" desc="Це допоможе підібрати маршрути й вигляд.">
              {needs.wheelchair && (
                <Field label="Чи можете подолати одну сходинку?">
                  <Segmented ariaLabel="Сходинка" value={step1} onChange={setStep1} options={[{ value: 'no', label: 'Ні' }, { value: 'yes', label: 'Так' }]} />
                </Field>
              )}
              {needs.blind && (
                <Field label="Зір">
                  <Segmented ariaLabel="Зір" value={vision} onChange={setVision} options={[{ value: 'low', label: 'Слабкий зір' }, { value: 'blind', label: 'Повністю незрячі' }]} />
                </Field>
              )}
              {!needs.wheelchair && !needs.blind && <p style={{ color: 'var(--sc-muted)' }}>Поверніться й оберіть потребу.</p>}
              <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </Step>
          )}

          {step === 3 && (
            <Step title="Зручний розмір тексту" desc="Перетягніть повзунок, доки текст не стане комфортним. Це можна змінити будь-коли згодом.">
              <div style={{ marginBottom: '1.1em' }}>
                <FontSizeSlider />
              </div>
              <p style={{ margin: '0 0 1.3em', padding: '0.9em 1em', borderRadius: '0.8em', background: 'var(--sc-surface-2)', border: 'var(--sc-bw) solid var(--sc-border)', lineHeight: 1.5 }}>
                Приклад тексту: «Кав’ярня на розі — вхід без сходів, є доступний туалет.»
              </p>
              {chosen.includes('blind') && (
                <p style={{ margin: '0 0 1.3em', color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                  Для незрячих і слабкозорих ми також увімкнемо високий контраст.
                </p>
              )}
              <Row>
                <Button onClick={() => setStep(4)}>Далі</Button>
                <Button variant="ghost" onClick={() => setStep(2)}>Назад</Button>
              </Row>
            </Step>
          )}

          {step === 4 && (
            <Step title="Доступ до місцезнаходження" desc="Щоб показувати доступні місця поруч і будувати маршрути, дозвольте доступ до геолокації. Можна зробити це пізніше.">
              <Row>
                <Button onClick={() => { if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.getCurrentPosition(() => finish(), () => finish()); else finish(); }}>Дозволити й завершити</Button>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.1em' }}>
      <div style={{ fontWeight: 600, fontSize: '0.92em', marginBottom: '0.5em' }}>{label}</div>
      {children}
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7em', justifyContent: 'space-between', marginTop: '1.4em' }}>
      <Button variant="ghost" onClick={onBack}>Назад</Button>
      <Button onClick={onNext} disabled={nextDisabled}>Далі</Button>
    </div>
  );
}

function NeedCard({ label, picked, primary, onToggle, onPrimary, canPrimary }: { label: string; picked: boolean; primary: boolean; onToggle: () => void; onPrimary: () => void; canPrimary: boolean }) {
  return (
    <div style={{ border: `var(--sc-bw) solid ${picked ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`, borderRadius: '0.9em', padding: '0.9em', background: picked ? 'var(--sc-primary-tint)' : 'var(--sc-surface)' }}>
      <button className="sc-foc" aria-pressed={picked} onClick={onToggle} style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: '0.7em', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span aria-hidden style={{ width: '1.5em', height: '1.5em', flexShrink: 0, borderRadius: '0.4em', display: 'grid', placeItems: 'center', background: picked ? 'var(--sc-primary)' : 'var(--sc-surface-2)', color: '#fff', fontWeight: 800 }}>{picked ? '✓' : ''}</span>
        <span style={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{label}</span>
      </button>
      {canPrimary && (
        <button className="sc-foc" aria-pressed={primary} onClick={onPrimary} style={{ marginTop: '0.6em', fontSize: '0.8em', fontWeight: 700, color: primary ? 'var(--sc-primary)' : 'var(--sc-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {primary ? '★ Основна потреба' : 'Зробити основною'}
        </button>
      )}
    </div>
  );
}
