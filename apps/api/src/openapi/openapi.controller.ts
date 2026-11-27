import { Controller, Get } from '@nestjs/common';
import { buildOpenApiDocument } from '@luminai/contracts';
import { Public } from '../identity/auth-context.js';

/** Serves the OpenAPI document generated from @luminai/contracts (non-production only). */
@Controller('openapi.json')
export class OpenApiController {
  private readonly document = buildOpenApiDocument();

  @Public()
  @Get()
  get(): Record<string, unknown> {
    return this.document;
  }
}
