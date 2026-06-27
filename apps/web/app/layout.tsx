import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import '@safecity/design-tokens/src/themes.css';
import './globals.css';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { A11yDevAudit } from '@/components/A11yDevAudit';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SafeCity — інклюзивна мапа Львова',
  description:
    'Інклюзивна мапа міста, що адаптується під кожного. Доступність — це продукт.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Set theme + text-size before paint to avoid a flash of the wrong theme/size.
const noFlash = `(function(){try{var e=document.documentElement;e.setAttribute('data-theme',localStorage.getItem('sc-theme')||'standard');var s=parseFloat(localStorage.getItem('sc-font-scale'));if(!isNaN(s)){e.style.setProperty('--sc-user-scale',String(Math.min(1.8,Math.max(0.85,s))));}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      data-sc-root
      data-theme="standard"
      className={onest.className}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <a href="#main-content" className="sc-skip">Перейти до вмісту</a>
        <ThemeProvider>
          <ProfileProvider>{children}</ProfileProvider>
        </ThemeProvider>
        <A11yDevAudit />
      </body>
    </html>
  );
}
