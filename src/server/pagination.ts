/**
 * Постраничная выдача.
 *
 * Потолок perPage жёсткий: без него один запрос со `perPage=100000`
 * кладёт базу — это пункт 9 в списке security-рисков.
 */

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 50;

export type PageInput = { page?: number; perPage?: number };

export type PageMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = { data: T[]; meta: PageMeta };

export function parsePaging(input: PageInput = {}): { page: number; perPage: number; skip: number; take: number } {
  const page = Math.max(1, Math.trunc(input.page ?? 1) || 1);
  const requested = Math.trunc(input.perPage ?? DEFAULT_PER_PAGE) || DEFAULT_PER_PAGE;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, requested));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

export function paginate<T>(data: T[], total: number, page: number, perPage: number): Paginated<T> {
  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  };
}
