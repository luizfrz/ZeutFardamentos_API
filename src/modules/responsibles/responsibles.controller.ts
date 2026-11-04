import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ResponsiblesService } from './responsibles.service.js';

@Controller('responsibles')
export class ResponsiblesController {
  constructor(private readonly service: ResponsiblesService) {}
  @Get() list(@Query('q') q?: string) { return this.service.list(q); }
  @Post() create(@Body() dto: { name: string; cpf: string; phone: string }) { return this.service.create(dto); }
}
