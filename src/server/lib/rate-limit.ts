/**
 * Ограничение частоты попыток.
 *
 * Реализация намеренно простая: счётчики в памяти процесса. Для монолита MVP
 * на одном инстансе этого достаточно, и это закрывает пункты 3 и 4 списка
 * security-рисков — перебор пароля и спам в форме заявки.
 *
 * Ограничение известно и записано: при нескольких инстансах или после
 * перезапуска счётчики обнуляются. Переезд на Redis не меняет сигнатуру
 * `consume`, поэтому вызывающий код останется прежним.
 */

import { TooManyRequestsError } from '../errors';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Периодическая уборка, чтобы карта не росла бесконечно. */
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitRule = {
  /** Логическое имя операции: 'auth.login', 'request.create'. */
  name: string;
  limit: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  login: { name: 'auth.login', limit: 10, windowMs: 15 * 60_000 },
  register: { name: 'auth.register', limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { name: 'auth.password-reset', limit: 5, windowMs: 60 * 60_000 },
  requestCreate: { name: 'request.create', limit: 10, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Учитывает попытку. Бросает TooManyRequestsError при превышении.
 * `subject` — то, по чему считаем: IP, email, нормализованный телефон.
 */
export function consume(rule: RateLimitRule, subject: string | null | undefined): void {
  if (!subject) return;

  const now = Date.now();
  sweep(now);

  const key = `${rule.name}:${subject}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > rule.limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new TooManyRequestsError(`Слишком много попыток. Попробуйте через ${seconds} с.`);
  }
}

/** Сброс успешной операции: удачный вход не должен приближать блокировку. */
export function reset(rule: RateLimitRule, subject: string | null | undefined): void {
  if (subject) buckets.delete(`${rule.name}:${subject}`);
}

/** Только для тестов. */
export function clearAllRateLimits(): void {
  buckets.clear();
}
