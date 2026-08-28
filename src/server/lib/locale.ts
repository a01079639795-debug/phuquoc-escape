/**
 * Мультиязычность — единый слой.
 *
 * Договорённость: схема поддерживает RU, EN и VI, но контент MVP заполняется
 * только на RU. Чтобы добавление языка позже осталось вставкой строк, а не
 * правкой бизнес-логики, ВСЕ чтения переводимого текста идут через этот модуль.
 * Ни один сервис не обращается к translations[0] напрямую.
 */

import { Locale } from '@prisma/client';

export const DEFAULT_LOCALE: Locale = Locale.RU;
export const SUPPORTED_LOCALES: readonly Locale[] = [Locale.RU, Locale.EN, Locale.VI];

/**
 * Порядок подбора языка. Для каждого запрошенного языка — цепочка запасных
 * вариантов, чтобы страница никогда не оказалась пустой из-за отсутствия
 * перевода. RU стоит последним всегда: это язык, на котором заполнен контент.
 */
const FALLBACK_CHAIN: Record<Locale, readonly Locale[]> = {
  [Locale.RU]: [Locale.RU, Locale.EN, Locale.VI],
  [Locale.EN]: [Locale.EN, Locale.RU, Locale.VI],
  [Locale.VI]: [Locale.VI, Locale.EN, Locale.RU],
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

export function resolveLocale(value: unknown): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Выбирает перевод по цепочке запасных языков.
 * Возвращает undefined только если переводов нет вообще — это дефект данных,
 * и сервис обязан отреагировать явно, а не показать пустую строку.
 */
export function pickTranslation<T extends { locale: Locale }>(
  translations: readonly T[],
  locale: Locale,
): T | undefined {
  for (const candidate of FALLBACK_CHAIN[locale]) {
    const found = translations.find((t) => t.locale === candidate);
    if (found) return found;
  }
  return translations[0];
}

/**
 * Список языков для запроса Prisma. Позволяет вытянуть только нужные переводы
 * вместо всех: на объёме каталога это заметная разница.
 */
export function localesToFetch(locale: Locale): Locale[] {
  return [...FALLBACK_CHAIN[locale]];
}
