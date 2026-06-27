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

// Set theme + text-size before paint to avoid a flash of the wrong theme.
const noFlash = `(function(){try{var t=localStorage.getItem('sc-theme')||'standard';var b=localStorage.getItem('sc-big')||'0';var e=document.documentElement;e.setAttribute('data-theme',t);e.setAttribute('data-big',b);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      data-sc-root
      data-theme="standard"
      data-big="0"
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
