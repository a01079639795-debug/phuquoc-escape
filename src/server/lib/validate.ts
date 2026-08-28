/**
 * Единая точка разбора входных данных.
 *
 * Zod — деталь реализации service layer, а не часть его контракта. Если
 * вызывать schema.parse() напрямую, наружу улетает ZodError, и транспорт
 * оказывается обязан знать про библиотеку валидации: при выносе API в
 * отдельный сервис это пришлось бы переписывать. Здесь ошибка превращается
 * в доменную ValidationError с разбором по полям.
 */

import { z } from 'zod';
import { ValidationError } from '../errors';

/** Плоский разбор: имя поля → список сообщений. */
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
  message = 'Проверьте правильность заполнения полей',
): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(message, fieldErrors(parsed.error));
  return parsed.data;
}
