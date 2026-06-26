import Link from 'next/link';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-4 px-5 py-3">
          <div className="mr-auto flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-lg font-extrabold text-primary-on"
            >
              ◍
            </span>
            <div className="leading-tight">
              <div className="font-extrabold">SafeCity</div>
              <div className="text-xs font-semibold text-muted">Львів</div>
            </div>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
          Доступність — це продукт
        </p>
        <h1 className="mt-2 max-w-[20ch] text-4xl font-extrabold leading-[1.1] tracking-tight">
          Один застосунок, що адаптується під вас
        </h1>
        <p className="mt-3 max-w-[62ch] leading-relaxed text-muted">
          Інклюзивна мапа Львова для людей з інвалідністю. Візуальна мапа для тих, хто
          користується кріслом колісним, та аудіо-перший список для незрячих. WCAG 2.2 AA як
          мінімум — статус завжди передається кольором, іконкою та підписом.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="grid min-h-[2.75em] place-items-center rounded-lg bg-primary px-6 font-bold text-primary-on"
          >
            Відкрити мапу
          </Link>
          <Link
            href="/onboarding"
            className="grid min-h-[2.75em] place-items-center rounded-lg border border-primary bg-surface px-6 font-bold text-primary"
          >
            Налаштувати під себе
          </Link>
        </div>

        <p className="mt-10 text-sm text-muted">
          Каркас веб-застосунку. Екрани додаються по черзі — див. дошку (epic:design-system).
        </p>
      </main>
    </div>
  );
}
