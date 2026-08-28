/**
 * Тексты уведомлений.
 *
 * Вынесены отдельно от доставки: формулировки меняются часто, механика
 * отправки — почти никогда.
 *
 * Сообщение намеренно содержит контакты клиента. Это рабочий инструмент
 * менеджера: он должен перезвонить, не открывая админку. Обратная сторона —
 * персональные данные уходят во внешний сервис, поэтому чат обязан быть
 * закрытым, а состав участников контролируемым.
 */

import { MessengerType, RequestType } from '@prisma/client';
import type { Notification } from './types';

const TYPE_LABELS: Record<RequestType, string> = {
  [RequestType.HOTEL]: 'Жильё',
  [RequestType.BIKE]: 'Байк',
  [RequestType.GENERAL]: 'Общий запрос',
};

const MESSENGER_LABELS: Record<MessengerType, string> = {
  [MessengerType.NONE]: '',
  [MessengerType.TELEGRAM]: 'Telegram',
  [MessengerType.WHATSAPP]: 'WhatsApp',
  [MessengerType.ZALO]: 'Zalo',
  [MessengerType.VIBER]: 'Viber',
};

/** Telegram разбирает ограниченный HTML, поэтому угловые скобки и амперсанд экранируем. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

export type NewRequestInput = {
  publicCode: string;
  type: RequestType;
  listingTitle: string | null;
  unitName: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  messenger: MessengerType;
  messengerHandle: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  guests: number | null;
  quantity: number | null;
  comment: string | null;
};

export function formatNewRequest(input: NewRequestInput): Notification {
  const lines: string[] = [
    `🆕 <b>Новая заявка ${escapeHtml(input.publicCode)}</b>`,
    `Тип: ${TYPE_LABELS[input.type]}`,
  ];

  if (input.listingTitle) {
    const unit = input.unitName ? ` — ${escapeHtml(input.unitName)}` : '';
    lines.push(`Объект: <b>${escapeHtml(input.listingTitle)}</b>${unit}`);
  }

  const from = formatDate(input.dateFrom);
  const to = formatDate(input.dateTo);
  if (from && to) lines.push(`Даты: ${from} — ${to}`);
  else if (from) lines.push(`Дата: ${from}`);

  if (input.guests) lines.push(`Гостей: ${input.guests}`);
  if (input.quantity) lines.push(`Количество: ${input.quantity}`);

  lines.push('');
  lines.push(`Клиент: <b>${escapeHtml(input.contactName)}</b>`);
  lines.push(`Телефон: ${escapeHtml(input.contactPhone)}`);

  if (input.contactEmail) lines.push(`Почта: ${escapeHtml(input.contactEmail)}`);

  if (input.messenger !== MessengerType.NONE && input.messengerHandle) {
    lines.push(`${MESSENGER_LABELS[input.messenger]}: ${escapeHtml(input.messengerHandle)}`);
  }

  if (input.comment) {
    lines.push('');
    lines.push(`Комментарий: ${escapeHtml(input.comment)}`);
  }

  return { kind: 'request.created', text: lines.join('\n') };
}
