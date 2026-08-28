/**
 * Работа с текстовыми идентификаторами: slug, телефон, публичный код заявки.
 */

import { randomBytes, randomInt } from 'node:crypto';

// ── slug ────────────────────────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Slug канонический — один на все языки (решение 7.4). Поэтому он строится
 * из названия на языке контента и транслитерируется в латиницу.
 */
export function slugify(input: string): string {
  const lowered = input.toLowerCase().trim();
  let out = '';
  for (const char of lowered) {
    const mapped = TRANSLIT[char];
    if (mapped !== undefined) out += mapped;
    else if (/[a-z0-9]/.test(char)) out += char;
    else out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'listing';
}

/**
 * Подбирает свободный slug: `villa-sunrise`, затем `villa-sunrise-2` и далее.
 * `isTaken` задаётся вызывающим сервисом, чтобы модуль не знал про базу.
 */
export async function uniqueSlug(base: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base);
  if (!(await isTaken(root))) return root;
  for (let i = 2; i <= 50; i++) {
    const candidate = `${root}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${root}-${randomBytes(3).toString('hex')}`;
}

// ── телефон ─────────────────────────────────────────────────────────────────

/**
 * Приведение к виду, близкому к E.164: только цифры с ведущим плюсом.
 *
 * Это намеренно не полноценный разбор номеров (для него нужна libphonenumber
 * с её базой планов нумерации). Задача здесь одна — получить стабильный ключ
 * для будущей дедупликации клиентов в CRM и для антиспам-лимитов. Исходный
 * номер в том виде, как его ввёл человек, сохраняется в contactPhone рядом.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

// ── публичный код заявки ────────────────────────────────────────────────────

/** Без 0/O/1/I/L: код диктуют по телефону и переписывают от руки. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generatePublicCode(): string {
  let body = '';
  for (let i = 0; i < 5; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `PQ-${body}`;
}
