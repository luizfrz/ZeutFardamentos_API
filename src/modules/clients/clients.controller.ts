import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ClientsService, type CreateClientDto } from './clients.service.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get() list(@Query('q') q?: string) { return this.service.list(q); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateClientDto) { return this.service.create(dto); }
}
