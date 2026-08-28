/**
 * Отправка уведомлений.
 *
 * Два правила:
 *  • сбой доставки не роняет основную операцию — заявка уже сохранена, и
 *    недоступный Telegram не повод отвечать клиенту ошибкой;
 *  • отправка не блокирует ответ — она уходит в фон.
 *
 * Из-за второго пункта нужен flush(): в тестах фоновая отправка иначе
 * не поддаётся детерминированной проверке.
 */

import { ConsoleNotifier, TelegramNotifier } from './telegram';
import type { Notification, NotifierPort } from './types';

export type { Notification, NotifierPort } from './types';
export { TelegramNotifier, ConsoleNotifier } from './telegram';
export { MemoryNotifier } from './memory';
export { formatNewRequest } from './messages';

let instance: NotifierPort | null = null;
const inFlight = new Set<Promise<void>>();

function build(): NotifierPort {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_MANAGER_CHAT_ID;

  if (botToken && chatId) return new TelegramNotifier({ botToken, chatId });

  if (process.env.NODE_ENV === 'production') {
    console.warn('[notify] TELEGRAM_BOT_TOKEN или TELEGRAM_MANAGER_CHAT_ID не заданы — заявки не уведомляются');
  }
  return new ConsoleNotifier();
}

export function getNotifier(): NotifierPort {
  instance ??= build();
  return instance;
}

/** Подмена канала в тестах. */
export function setNotifier(notifier: NotifierPort | null): void {
  instance = notifier;
}

/**
 * Ставит уведомление в отправку и сразу возвращает управление.
 *
 * Вызывающий не ждёт сети: для клиента заявка считается принятой в момент
 * записи в базу.
 */
export function notify(notification: Notification): void {
  const promise = getNotifier()
    .send(notification)
    .catch((error) => {
      console.error('[notify] непредвиденный сбой доставки:', error);
    })
    .finally(() => {
      inFlight.delete(promise);
    });

  inFlight.add(promise);
}

/** Дожидается всех начатых отправок. Нужно тестам и корректному завершению процесса. */
export async function flushNotifications(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}
