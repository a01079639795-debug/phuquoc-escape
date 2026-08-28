/**
 * Деньги.
 *
 * В базе — целое число МИНОРНЫХ единиц (BigInt) плюс валюта: для VND это
 * донги (минорная единица равна основной), для USD — центы. Ни одно денежное
 * значение не бывает дробным на уровне хранения.
 *
 * Этот модуль — единственное место, где BigInt превращается в то, что можно
 * отдать наружу. Причина не косметическая: BigInt не сериализуется в JSON
 * штатно, и без общего маппера каждый вызывающий изобретал бы своё
 * преобразование — с риском потери точности.
 */

import { Currency } from '@prisma/client';

/** Сколько минорных единиц в одной основной. */
const MINOR_PER_MAJOR: Record<Currency, number> = {
  [Currency.VND]: 1,
  [Currency.USD]: 100,
};

const FRACTION_DIGITS: Record<Currency, number> = {
  [Currency.VND]: 0,
  [Currency.USD]: 2,
};

export type MoneyDto = {
  /** Минорные единицы. Именно это значение возвращается обратно в сервисы. */
  amount: number;
  currency: Currency;
  /** Готовая к показу строка: «1 350 000 ₫», «$150.00». */
  formatted: string;
};

/**
 * Верхняя граница безопасного целого в JavaScript. Суммы платформы на порядки
 * меньше, но проверка стоит одного сравнения и ловит порчу данных до того,
 * как она молча превратится в неточное число.
 */
function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Денежное значение вне безопасного диапазона: ${value}`);
  }
  return Number(value);
}

export function formatMoney(minor: number, currency: Currency, locale = 'ru-RU'): string {
  const major = minor / MINOR_PER_MAJOR[currency];
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: FRACTION_DIGITS[currency],
    maximumFractionDigits: FRACTION_DIGITS[currency],
  }).format(major);
}

export function toMoney(value: bigint | null | undefined, currency: Currency, locale?: string): MoneyDto | null {
  if (value === null || value === undefined) return null;
  const amount = toSafeNumber(value);
  return { amount, currency, formatted: formatMoney(amount, currency, locale) };
}

/** Обратное преобразование для входящих данных админки. */
export function fromMinorUnits(amount: number): bigint {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`Сумма должна быть целым числом минорных единиц, получено: ${amount}`);
  }
  return BigInt(amount);
}
