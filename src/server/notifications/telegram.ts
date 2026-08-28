/**
 * Доставка в Telegram.
 *
 * Обращение к Bot API идёт обычным fetch: отдельный клиент ради одного
 * вызова sendMessage не нужен.
 */

import type { Notification, NotifierPort } from './types';

/** Дольше ждать бессмысленно: заявка уже сохранена, сообщение можно повторить. */
const TIMEOUT_MS = 5000;

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export class TelegramNotifier implements NotifierPort {
  readonly kind = 'telegram';

  constructor(private readonly config: TelegramConfig) {}

  async send(notification: Notification): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: notification.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        // Тело ответа Telegram содержит причину: «чат не найден», «бот
        // заблокирован». Это важно видеть в логах, но токен туда не попадает.
        const detail = await response.text().catch(() => '');
        console.error(`[telegram] ${response.status}: ${detail.slice(0, 300)}`);
      }
    } catch (error) {
      console.error('[telegram] не удалось отправить сообщение:', error);
    }
  }
}

/**
 * Заглушка для окружения без настроенного бота.
 *
 * Пишет сообщение в лог вместо отправки: при разработке видно, что и когда
 * ушло бы менеджеру, и при этом ничего не отправляется наружу.
 */
export class ConsoleNotifier implements NotifierPort {
  readonly kind = 'console';

  async send(notification: Notification): Promise<void> {
    console.info(`[notify:${notification.kind}]\n${notification.text}`);
  }
}
