/**
 * Заявки — основной сценарий конверсии MVP.
 *
 * Заявка это лид: она ничего не резервирует и не блокирует. Даты, юнит и
 * количество хранятся уже сейчас, потому что на этапе 2 именно они станут
 * бронью. Сама заявка при этом останется — как форма запроса и как источник
 * лидов для CRM.
 */

import { ListingStatus, MessengerType, Prisma, RequestSource, RequestStatus, RequestType } from '@prisma/client';
import type { Locale } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertAuthenticated, assertStaff, STAFF_ROLES } from '../authz';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { parseInput } from '../lib/validate';
import { generatePublicCode, normalizePhone } from '../lib/text';
import { pickTranslation, resolveLocale } from '../lib/locale';
import { writeAudit } from '../lib/audit';
import { withIdempotency } from '../lib/idempotency';
import { RATE_LIMITS, consume } from '../lib/rate-limit';
import { paginate, parsePaging, type Paginated } from '../pagination';
import { formatNewRequest, notify } from '../notifications';

// ── допустимые переходы статусов ────────────────────────────────────────────

/**
 * Статус меняется только по этой таблице. Прямая правка status в обход
 * updateStatus запрещена: иначе история в AuditLog перестанет быть полной.
 */
const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  [RequestStatus.NEW]: [RequestStatus.IN_PROGRESS, RequestStatus.CANCELLED],
  [RequestStatus.IN_PROGRESS]: [RequestStatus.CONFIRMED, RequestStatus.CANCELLED],
  [RequestStatus.CONFIRMED]: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
  [RequestStatus.COMPLETED]: [],
  [RequestStatus.CANCELLED]: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ── схемы ───────────────────────────────────────────────────────────────────

export const createRequestSchema = z
  .object({
    type: z.nativeEnum(RequestType),
    listingId: z.string().uuid().optional().nullable(),
    listingUnitId: z.string().uuid().optional().nullable(),
    contactName: z.string().trim().min(2, 'Укажите имя').max(120),
    contactPhone: z.string().trim().min(6, 'Укажите телефон').max(40),
    contactEmail: z.string().trim().toLowerCase().email().max(320).optional().nullable(),
    messenger: z.nativeEnum(MessengerType).default(MessengerType.NONE),
    messengerHandle: z.string().trim().max(120).optional().nullable(),
    dateFrom: z.coerce.date().optional().nullable(),
    dateTo: z.coerce.date().optional().nullable(),
    guests: z.number().int().min(1).max(30).optional().nullable(),
    quantity: z.number().int().min(1).max(20).optional().nullable(),
    comment: z.string().trim().max(2000).optional().nullable(),
    locale: z.string().optional(),
    /**
     * Приманка для ботов: поле скрыто в форме, человек его не заполняет.
     * Схема принимает любое значение намеренно — отбраковка происходит в теле
     * сервиса, иначе бот получал бы подробную ошибку валидации по этому полю
     * и сразу понимал, на чём попался.
     */
    website: z.string().max(200).optional(),
    utm: z.record(z.string(), z.string().max(200)).optional().nullable(),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateTo >= v.dateFrom, {
    message: 'Дата окончания не может быть раньше даты начала',
    path: ['dateTo'],
  })
  .refine((v) => v.messenger === MessengerType.NONE || Boolean(v.messengerHandle), {
    message: 'Укажите контакт в выбранном мессенджере',
    path: ['messengerHandle'],
  });

export const adminListRequestsSchema = z.object({
  status: z.nativeEnum(RequestStatus).optional(),
  type: z.nativeEnum(RequestType).optional(),
  assignedToId: z.string().uuid().optional(),
  unassigned: z.boolean().optional(),
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

export type RequestContext = { ip?: string | null; userAgent?: string | null; idempotencyKey?: string | null };

// ── DTO ─────────────────────────────────────────────────────────────────────

export type RequestDto = {
  id: string;
  publicCode: string;
  type: RequestType;
  status: RequestStatus;
  listing: { id: string; slug: string; title: string } | null;
  unitName: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  guests: number | null;
  quantity: number | null;
  comment: string | null;
  createdAt: Date;
};

export type AdminRequestDto = RequestDto & {
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  messenger: MessengerType;
  messengerHandle: string | null;
  source: RequestSource;
  locale: Locale;
  assignedTo: { id: string; name: string } | null;
  notes: { id: string; body: string; authorName: string; createdAt: Date }[];
};

const requestInclude = {
  listing: { include: { translations: true } },
  listingUnit: { include: { translations: true } },
} satisfies Prisma.RequestInclude;

type RequestRow = Prisma.RequestGetPayload<{ include: typeof requestInclude }>;

function toRequestDto(row: RequestRow, locale: Locale): RequestDto {
  return {
    id: row.id,
    publicCode: row.publicCode,
    type: row.type,
    status: row.status,
    listing: row.listing
      ? {
          id: row.listing.id,
          slug: row.listing.slug,
          title: pickTranslation(row.listing.translations, locale)?.title ?? row.listing.slug,
        }
      : null,
    unitName: row.listingUnit ? pickTranslation(row.listingUnit.translations, locale)?.name ?? null : null,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    guests: row.guests,
    quantity: row.quantity,
    comment: row.comment,
    createdAt: row.createdAt,
  };
}

// ── создание ────────────────────────────────────────────────────────────────

/**
 * Создание заявки.
 *
 * Публичный эндпоинт, поэтому здесь собраны все защиты сразу: ограничение
 * частоты по IP и телефону, honeypot-поле, идемпотентность против двойной
 * отправки формы.
 */
export async function createRequest(
  input: unknown,
  actor: Actor | null = null,
  ctx: RequestContext = {},
): Promise<RequestDto> {
  const data = parseInput(createRequestSchema, input);

  // Заполненная приманка — это бот. Ответ выглядит как успех, чтобы не
  // подсказывать, по какому признаку заявка отклонена.
  if (data.website) {
    throw new ValidationError('Не удалось отправить заявку. Обновите страницу и попробуйте ещё раз.');
  }

  const phoneNormalized = normalizePhone(data.contactPhone);
  consume(RATE_LIMITS.requestCreate, ctx.ip);
  consume(RATE_LIMITS.requestCreate, phoneNormalized);

  const locale = resolveLocale(data.locale);

  return withIdempotency(
    { scope: 'request.create', key: ctx.idempotencyKey, userId: actor?.id, payload: data },
    async () => {
      // Заявку можно оставить только на опубликованный объект: ссылка на
      // черновик или архив означает устаревшую страницу.
      if (data.listingId) {
        const listing = await prisma.listing.findFirst({
          where: { id: data.listingId, status: ListingStatus.PUBLISHED },
          select: { id: true },
        });
        if (!listing) throw new NotFoundError('listing', data.listingId);
      }

      if (data.listingUnitId) {
        const unit = await prisma.listingUnit.findFirst({
          where: { id: data.listingUnitId, listingId: data.listingId ?? undefined, isActive: true },
          select: { id: true },
        });
        if (!unit) throw new ValidationError('Выбранный вариант размещения недоступен');
      }

      const created = await createWithUniqueCode(data, actor, ctx, phoneNormalized, locale);
      const dto = toRequestDto(created, locale);

      // Уведомление уходит в фон и не может провалить операцию: заявка уже
      // записана, а недоступный Telegram — не повод отвечать клиенту ошибкой.
      // Повторный запрос с тем же ключом идемпотентности сюда не доходит,
      // поэтому дубля сообщения не будет.
      notify(
        formatNewRequest({
          publicCode: created.publicCode,
          type: created.type,
          listingTitle: dto.listing?.title ?? null,
          unitName: dto.unitName,
          contactName: created.contactName,
          contactPhone: created.contactPhone,
          contactEmail: created.contactEmail,
          messenger: created.messenger,
          messengerHandle: created.messengerHandle,
          dateFrom: created.dateFrom,
          dateTo: created.dateTo,
          guests: created.guests,
          quantity: created.quantity,
          comment: created.comment,
        }),
      );

      return dto;
    },
  );
}

/** publicCode генерируется случайно; на коллизию отвечаем повтором, а не ошибкой. */
async function createWithUniqueCode(
  data: z.infer<typeof createRequestSchema>,
  actor: Actor | null,
  ctx: RequestContext,
  phoneNormalized: string | null,
  locale: Locale,
): Promise<RequestRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.request.create({
          data: {
            publicCode: generatePublicCode(),
            type: data.type,
            status: RequestStatus.NEW,
            listingId: data.listingId ?? null,
            listingUnitId: data.listingUnitId ?? null,
            userId: actor?.id ?? null,
            contactName: data.contactName,
            contactPhone: data.contactPhone,
            contactPhoneNormalized: phoneNormalized,
            contactEmail: data.contactEmail ?? null,
            messenger: data.messenger,
            messengerHandle: data.messengerHandle ?? null,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            guests: data.guests ?? null,
            quantity: data.quantity ?? null,
            comment: data.comment ?? null,
            locale,
            source: data.listingId ? RequestSource.WEB_LISTING : RequestSource.WEB_GENERAL,
            utm: data.utm ? (data.utm as Prisma.InputJsonValue) : Prisma.DbNull,
            ip: ctx.ip ?? null,
            userAgent: ctx.userAgent ?? null,
          },
          include: requestInclude,
        });

        await writeAudit(tx, {
          actorId: actor?.id ?? null,
          actorRole: actor?.role ?? null,
          entity: 'Request',
          entityId: created.id,
          action: 'create',
          after: { publicCode: created.publicCode, status: created.status },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        return created;
      });
    } catch (e) {
      const collision =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        String(e.meta?.target ?? '').includes('publicCode');
      if (!collision) throw e;
    }
  }
  throw new ConflictError('PUBLIC_CODE_COLLISION', 'Не удалось сгенерировать код заявки, попробуйте ещё раз');
}

// ── кабинет пользователя ────────────────────────────────────────────────────

export async function listMyRequests(actor: Actor | null, input: { page?: number; perPage?: number } = {}, locale?: unknown): Promise<Paginated<RequestDto>> {
  assertAuthenticated(actor);
  const resolved = resolveLocale(locale);
  const { page, perPage, skip, take } = parsePaging(input);

  // Владение проверяется запросом, а не сравнением после выборки —
  // это единственная надёжная защита от IDOR.
  const where: Prisma.RequestWhereInput = { userId: actor.id };

  const [rows, total] = await Promise.all([
    prisma.request.findMany({ where, include: requestInclude, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.request.count({ where }),
  ]);

  const data = rows.map((row) => toRequestDto(row, resolved));
  return paginate(data, total, page, perPage);
}

export async function getMyRequest(actor: Actor | null, requestId: string, locale?: unknown): Promise<RequestDto> {
  assertAuthenticated(actor);
  const row = await prisma.request.findFirst({
    where: { id: requestId, userId: actor.id },
    include: requestInclude,
  });
  if (!row) throw new NotFoundError('request', requestId);
  return toRequestDto(row, resolveLocale(locale));
}

// ── админка ─────────────────────────────────────────────────────────────────

export async function adminListRequests(actor: Actor | null, input: unknown = {}, locale?: unknown): Promise<Paginated<AdminRequestDto>> {
  assertStaff(actor);
  const filters = parseInput(adminListRequestsSchema, input);
  const resolved = resolveLocale(locale);
  const { page, perPage, skip, take } = parsePaging(filters);

  const where: Prisma.RequestWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.unassigned ? { assignedToId: null } : {}),
    ...(filters.query
      ? {
          OR: [
            { publicCode: { contains: filters.query, mode: 'insensitive' } },
            { contactName: { contains: filters.query, mode: 'insensitive' } },
            { contactPhone: { contains: filters.query } },
            { contactPhoneNormalized: { contains: filters.query.replace(/\D/g, '') } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.request.findMany({
      where,
      include: {
        ...requestInclude,
        assignedTo: { select: { id: true, name: true } },
        notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.request.count({ where }),
  ]);

  const data = rows.map((row) => ({
    ...toRequestDto(row, resolved),
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    messenger: row.messenger,
    messengerHandle: row.messengerHandle,
    source: row.source,
    locale: row.locale,
    assignedTo: row.assignedTo,
    notes: row.notes.map((n) => ({ id: n.id, body: n.body, authorName: n.author.name, createdAt: n.createdAt })),
  }));

  return paginate(data, total, page, perPage);
}

export async function updateRequestStatus(
  actor: Actor | null,
  requestId: string,
  rawStatus: unknown,
): Promise<void> {
  assertStaff(actor);
  const next = parseInput(z.nativeEnum(RequestStatus), rawStatus, 'Неизвестный статус заявки');

  const current = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true } });
  if (!current) throw new NotFoundError('request', requestId);
  if (current.status === next) return;

  if (!canTransition(current.status, next)) {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Недопустимый переход статуса: ${current.status} → ${next}`,
      { from: current.status, to: next, allowed: ALLOWED_TRANSITIONS[current.status] },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({ where: { id: requestId }, data: { status: next } });
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Request', entityId: requestId, action: 'status_change',
      before: { status: current.status }, after: { status: next },
    });
  });
}

export async function assignRequest(actor: Actor | null, requestId: string, rawManagerId: unknown): Promise<void> {
  assertStaff(actor);
  const managerId = parseInput(z.string().uuid().nullable(), rawManagerId ?? null, 'Некорректный идентификатор сотрудника');

  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { assignedToId: true } });
  if (!request) throw new NotFoundError('request', requestId);

  if (managerId) {
    const manager = await prisma.user.findFirst({
      where: { id: managerId, role: { in: [...STAFF_ROLES] }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!manager) throw new ValidationError('Ответственным можно назначить только активного сотрудника');
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({ where: { id: requestId }, data: { assignedToId: managerId } });
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Request', entityId: requestId, action: 'assign',
      before: { assignedToId: request.assignedToId }, after: { assignedToId: managerId },
    });
  });
}

export async function addRequestNote(actor: Actor | null, requestId: string, body: string): Promise<string> {
  assertStaff(actor);

  const text = parseInput(z.string().trim().min(1, 'Комментарий не может быть пустым').max(4000), body);

  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!request) throw new NotFoundError('request', requestId);

  const note = await prisma.requestNote.create({
    data: { requestId, authorId: actor.id, body: text },
  });
  return note.id;
}
