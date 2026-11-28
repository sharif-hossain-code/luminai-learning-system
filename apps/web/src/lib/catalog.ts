import 'server-only';
import {
  catalogCourseDetailSchema,
  catalogCourseSchema,
  categorySchema,
  paginationSchema,
  type CatalogCourseDetail,
  type Category,
} from '@luminai/contracts';
import { z } from 'zod';
import { apiBaseUrl } from './server-env';

const listSchema = z.object({ data: z.array(catalogCourseSchema), pagination: paginationSchema });
export type CatalogPage = z.infer<typeof listSchema>;

/** Public catalogue reads from the server. Throws on network or API errors (error.tsx shows them). */
async function get(path: string): Promise<Response> {
  return fetch(`${apiBaseUrl()}/api/v1${path}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
}

export async function getCategories(): Promise<Category[]> {
  const response = await get('/catalog/categories');
  if (!response.ok) throw new Error(`Categories request failed (${response.status})`);
  return z.object({ data: z.array(categorySchema) }).parse(await response.json()).data;
}

export async function getCourses(params: URLSearchParams): Promise<CatalogPage> {
  const response = await get(`/catalog/courses?${params.toString()}`);
  // Hand-edited URLs with bad filters show an empty result, not an error page.
  if (response.status === 422) {
    return { data: [], pagination: { page: 1, pageSize: 12, total: 0 } };
  }
  if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
  return listSchema.parse(await response.json());
}

/** Null when the course doesn't exist or isn't published. */
export async function getCourse(idOrSlug: string): Promise<CatalogCourseDetail | null> {
  const response = await get(`/catalog/courses/${encodeURIComponent(idOrSlug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Course request failed (${response.status})`);
  return z.object({ data: catalogCourseDetailSchema }).parse(await response.json()).data;
}
