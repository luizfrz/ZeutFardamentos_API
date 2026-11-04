import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { type CreateMoldDto, MoldsService } from './molds.service.js';

@Controller()
export class MoldsController {
  constructor(private readonly service: MoldsService) {}
  @Get('molds') list() { return this.service.list(); }
  @Post('molds') create(@Body() dto: CreateMoldDto) { return this.service.create(dto); }
  @Delete('molds/:id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Get('size-grids') grids() { return this.service.grids(); }
}
