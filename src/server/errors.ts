/**
 * Доменные ошибки.
 *
 * Сервисы не знают про HTTP, но знают, «что именно пошло не так». Поле
 * `status` — подсказка транспортному слою, а не зависимость от него:
 * при выносе API в отдельный сервис маппинг останется тем же.
 */

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

/**
 * Сущности, о ненайденности которых сообщаем.
 *
 * Код и текст разделены намеренно: код — стабильный машиночитаемый
 * идентификатор для клиента и логов, текст — сообщение человеку. Собирать код
 * из русского названия нельзя: получается нечитаемый машиной `ОБЪЕКТ_NOT_FOUND`,
 * который к тому же поменяется при первой же правке формулировки.
 */
const ENTITIES = {
  listing: { code: 'LISTING', message: 'Объект не найден' },
  unit: { code: 'LISTING_UNIT', message: 'Вариант размещения не найден' },
  image: { code: 'LISTING_IMAGE', message: 'Изображение не найдено' },
  request: { code: 'REQUEST', message: 'Заявка не найдена' },
  user: { code: 'USER', message: 'Пользователь не найден' },
  media: { code: 'MEDIA', message: 'Файл не найден' },
  area: { code: 'AREA', message: 'Район не найден' },
  amenity: { code: 'AMENITY', message: 'Удобство не найдено' },
} as const;

export type EntityKey = keyof typeof ENTITIES;

/** Запись не найдена — либо её нет, либо она недоступна этому пользователю. */
export class NotFoundError extends AppError {
  constructor(entity: EntityKey, hint?: string) {
    const { code, message } = ENTITIES[entity];
    super(`${code}_NOT_FOUND`, hint ? `${message}: ${hint}` : message, 404);
  }
}

/** Нарушение уникальности или недопустимый переход состояния. */
export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}

/** Некорректный ввод. `details` содержит разбор по полям. */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_FAILED', message, 422, details);
  }
}

/** Не аутентифицирован: нет сессии или она истекла. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Требуется вход в систему') {
    super('UNAUTHORIZED', message, 401);
  }
}

/** Аутентифицирован, но не имеет права на действие. */
export class ForbiddenError extends AppError {
  constructor(message = 'Недостаточно прав') {
    super('FORBIDDEN', message, 403);
  }
}

/** Слишком много попыток. */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Слишком много попыток, попробуйте позже') {
    super('TOO_MANY_REQUESTS', message, 429);
  }
}
