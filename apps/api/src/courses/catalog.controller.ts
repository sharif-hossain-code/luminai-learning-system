import { Controller, Get, Param, Query } from '@nestjs/common';
import { catalogQuerySchema, type CatalogQuery } from '@luminai/contracts';
import { z } from 'zod';
import { Public } from '../identity/auth-context.js';
import { CatalogService } from './catalog.service.js';

/** Public catalogue: published courses only. Anyone can browse; lessons need enrolment. */
@Controller('catalog')
@Public()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  async categories() {
    return { data: await this.catalog.categories() };
  }

  @Get('courses')
  async courses(@Query({ schema: catalogQuerySchema }) query: CatalogQuery) {
    const { data, total } = await this.catalog.list(query);
    return { data, pagination: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Get('courses/:courseIdOrSlug')
  async course(
    @Param('courseIdOrSlug', { schema: z.string().trim().min(1).max(80) }) idOrSlug: string,
  ) {
    return { data: await this.catalog.detail(idOrSlug) };
  }
}
