/**
 * Единственная точка доступа к базе.
 *
 * Всё, что лежит в src/server, никогда не импортируется клиентским кодом:
 * граница проходит по этому каталогу, а не по соглашению об именах.
 */

import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

// В dev-режиме Next.js перезагружает модули при каждом изменении файла;
// без этого кэша соединения к базе накапливались бы до исчерпания пула.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Клиент внутри транзакции и обычный клиент взаимозаменяемы для сервисов.
 * Функции, которые могут вызываться как самостоятельно, так и внутри
 * транзакции, принимают именно этот тип.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
