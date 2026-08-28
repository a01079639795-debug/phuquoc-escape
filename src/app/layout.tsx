import type { Metadata, Viewport } from 'next';
import { Golos_Text, Manrope, Marck_Script, Playfair_Display } from 'next/font/google';

import './globals.css';

/**
 * Четыре шрифтовые роли.
 *
 * Manrope — только имя острова на первом экране. Геометрический гротеск с
 * округлыми овалами: на фотографии он читается как надпись на обложке, а не
 * как подпись, положенная поверх снимка. Латиница и вьетнамская диакритика —
 * больше этому шрифту здесь ничего не нужно.
 *
 * Playfair Display — крупные заголовки разделов: контрастная антиква, ради
 * которой каталог читается как журнал о путешествиях. Есть кириллица.
 *
 * Marck Script — рукописные вставки («Жильё. Байки. Открытия.», «для вас»).
 * Кириллический скрипт: латинские каллиграфические шрифты на русском
 * подставляют чужие буквы.
 *
 * Golos Text — весь остальной текст. Рисовался под кириллицу.
 */
const manrope = Manrope({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-hero',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic', 'vietnamese'],
  variable: '--font-playfair',
  display: 'swap',
});

const script = Marck_Script({
  subsets: ['latin', 'cyrillic'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
});

const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-golos',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Фукуок — жильё и байки на острове',
    template: '%s · Фукуок',
  },
  description:
    'Отели, виллы и аренда байков на Фукуоке. Подбираем жильё и технику под маршрут: от гестхауса в Дуонг Донге до виллы на Бай Сао.',
  openGraph: { type: 'website', locale: 'ru_RU', siteName: 'Фукуок' },
};

export const viewport: Viewport = {
  themeColor: '#fbf6ee',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${playfair.variable} ${script.variable} ${golos.variable} ${manrope.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
