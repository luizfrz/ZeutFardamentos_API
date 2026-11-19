import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { Address } from '../../common/types.js';
import { ClientsService, type CreateClientDto } from './clients.service.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get() list(@Query('q') q?: string) { return this.service.list(q); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateClientDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: CreateClientDto) { return this.service.update(id, dto); }
  @Patch(':id/address') setAddress(@Param('id') id: string, @Body('address') address?: Address) { return this.service.setAddress(id, address); }
}
