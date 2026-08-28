/**
 * Аутентификация: регистрация, вход, сессии, пароли.
 *
 * Модель сессии — опаковый токен: наружу уходит случайная строка, в базе
 * лежит только её sha256. Отзыв мгновенный, дамп базы не даёт войти
 * под пользователем.
 */

import { UserRole, UserStatus, UserTokenType } from '@prisma/client';
import type { User } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertAuthenticated } from '../authz';
import { ConflictError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError } from '../errors';
import { parseInput } from '../lib/validate';
import { generateToken, hashPassword, hashToken, verifyPassword } from '../lib/crypto';
import { normalizePhone } from '../lib/text';
import { resolveLocale } from '../lib/locale';
import { writeAudit } from '../lib/audit';
import { RATE_LIMITS, consume, reset } from '../lib/rate-limit';

export const SESSION_TTL_DAYS = 30;
const PASSWORD_RESET_TTL_MINUTES = 60;
const EMAIL_VERIFICATION_TTL_HOURS = 48;

// ── схемы ───────────────────────────────────────────────────────────────────

const password = z.string().min(8, 'Пароль должен быть не короче 8 символов').max(200);
const email = z.string().trim().toLowerCase().email('Некорректный адрес электронной почты').max(320);

export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(2, 'Укажите имя').max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  locale: z.string().optional(),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const resetPasswordSchema = z.object({ token: z.string().min(10).max(200), newPassword: password });

export type RequestContext = { ip?: string | null; userAgent?: string | null };

// ── DTO ─────────────────────────────────────────────────────────────────────

export type UserDto = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  locale: string;
  emailVerified: boolean;
  createdAt: Date;
};

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    locale: user.locale,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}

export type SessionResult = { user: UserDto; token: string; expiresAt: Date };

// ── сессии ──────────────────────────────────────────────────────────────────

async function createSession(userId: string, ctx: RequestContext): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * Разбор токена сессии. Возвращает null вместо ошибки: вызывающий сам решает,
 * требовать ли вход. Заблокированный пользователь трактуется как отсутствие
 * сессии, чтобы блокировка действовала немедленно.
 */
export async function getSession(token: string | null | undefined): Promise<{ actor: Actor; user: UserDto } | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.status === UserStatus.BLOCKED) return null;

  // Отметка активности нужна для будущего показа «активные сессии» в кабинете.
  await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

  return {
    actor: { id: session.user.id, role: session.user.role, status: session.user.status },
    user: toUserDto(session.user),
  };
}

export async function logout(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutEverywhere(userId: string, exceptToken?: string): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptToken ? { NOT: { tokenHash: hashToken(exceptToken) } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return count;
}

// ── регистрация и вход ──────────────────────────────────────────────────────

export async function register(input: unknown, ctx: RequestContext = {}): Promise<SessionResult> {
  const data = parseInput(registerSchema, input);
  consume(RATE_LIMITS.register, ctx.ip);

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'Аккаунт с таким адресом уже существует');
  }

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: await hashPassword(data.password),
      name: data.name,
      phone: data.phone ?? null,
      phoneNormalized: normalizePhone(data.phone),
      locale: resolveLocale(data.locale),
    },
  });

  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    entity: 'User',
    entityId: user.id,
    action: 'register',
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const session = await createSession(user.id, ctx);
  return { user: toUserDto(user), ...session };
}

export async function login(input: unknown, ctx: RequestContext = {}): Promise<SessionResult> {
  const data = parseInput(loginSchema, input);

  consume(RATE_LIMITS.login, ctx.ip);
  consume(RATE_LIMITS.login, data.email);

  const user = await prisma.user.findUnique({ where: { email: data.email } });

  // Одинаковый ответ для несуществующего адреса и неверного пароля:
  // иначе форма входа превращается в проверку «есть ли такой аккаунт».
  const ok = user ? await verifyPassword(user.passwordHash, data.password) : false;
  if (!user || !ok) throw new UnauthorizedError('Неверный адрес или пароль');

  if (user.status === UserStatus.BLOCKED) throw new ForbiddenError('Аккаунт заблокирован');

  reset(RATE_LIMITS.login, data.email);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const session = await createSession(user.id, ctx);

  return { user: toUserDto(user), ...session };
}

// ── пароли ──────────────────────────────────────────────────────────────────

export async function changePassword(actor: Actor | null, input: unknown, currentToken?: string): Promise<void> {
  assertAuthenticated(actor);
  const data = parseInput(changePasswordSchema, input);

  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user) throw new NotFoundError('user');

  if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
    throw new UnauthorizedError('Текущий пароль указан неверно');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(data.newPassword) },
  });

  // Смена пароля обрывает все прочие сессии: если пароль меняют из-за утечки,
  // чужая сессия не должна пережить смену.
  await logoutEverywhere(user.id, currentToken);

  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    entity: 'User',
    entityId: user.id,
    action: 'password_change',
  });
}

/**
 * Запрос сброса пароля.
 *
 * Возвращает токен, чтобы его отправил слой уведомлений. Транспорт обязан
 * НЕ отдавать это значение клиенту: ответ пользователю всегда одинаков,
 * существует адрес или нет.
 */
export async function requestPasswordReset(rawEmail: unknown, ctx: RequestContext = {}): Promise<{ token: string | null }> {
  const parsed = email.safeParse(rawEmail);
  if (!parsed.success) return { token: null };

  consume(RATE_LIMITS.passwordReset, ctx.ip);
  consume(RATE_LIMITS.passwordReset, parsed.data);

  const user = await prisma.user.findUnique({ where: { email: parsed.data }, select: { id: true } });
  if (!user) return { token: null };

  const token = generateToken();
  await prisma.userToken.create({
    data: {
      userId: user.id,
      type: UserTokenType.PASSWORD_RESET,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
  });

  return { token };
}

export async function resetPassword(input: unknown): Promise<void> {
  const data = parseInput(resetPasswordSchema, input);

  const record = await prisma.userToken.findUnique({
    where: { tokenHash: hashToken(data.token) },
    include: { user: true },
  });

  if (
    !record ||
    record.type !== UserTokenType.PASSWORD_RESET ||
    record.usedAt !== null ||
    record.expiresAt <= new Date()
  ) {
    throw new ValidationError('Ссылка недействительна или срок её действия истёк');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(data.newPassword) },
    }),
    prisma.userToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAudit(prisma, {
    actorId: record.userId,
    actorRole: record.user.role,
    entity: 'User',
    entityId: record.userId,
    action: 'password_reset',
  });
}

// ── подтверждение адреса ────────────────────────────────────────────────────

export async function requestEmailVerification(actor: Actor | null): Promise<{ token: string }> {
  assertAuthenticated(actor);

  const token = generateToken();
  await prisma.userToken.create({
    data: {
      userId: actor.id,
      type: UserTokenType.EMAIL_VERIFICATION,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3600_000),
    },
  });

  return { token };
}

export async function verifyEmail(token: string): Promise<void> {
  const record = await prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) } });

  if (
    !record ||
    record.type !== UserTokenType.EMAIL_VERIFICATION ||
    record.usedAt !== null ||
    record.expiresAt <= new Date()
  ) {
    throw new ValidationError('Ссылка недействительна или срок её действия истёк');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.userToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}
