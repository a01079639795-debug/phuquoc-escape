/**
 * Канал, складывающий сообщения в память. Только для тестов.
 */

import type { Notification, NotifierPort } from './types';

export class MemoryNotifier implements NotifierPort {
  readonly kind = 'memory';
  readonly sent: Notification[] = [];

  /** Позволяет проверить, что сбой канала не ломает создание заявки. */
  failNext = false;

  async send(notification: Notification): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('канал уведомлений недоступен');
    }
    this.sent.push(notification);
  }

  clear(): void {
    this.sent.length = 0;
    this.failNext = false;
  }

  get last(): Notification | undefined {
    return this.sent[this.sent.length - 1];
  }
}
