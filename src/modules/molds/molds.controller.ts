import { Body, Controller, Get, Post } from '@nestjs/common';
import { type CreateMoldDto, MoldsService } from './molds.service.js';

@Controller()
export class MoldsController {
  constructor(private readonly service: MoldsService) {}
  @Get('molds') list() { return this.service.list(); }
  @Post('molds') create(@Body() dto: CreateMoldDto) { return this.service.create(dto); }
  @Get('size-grids') grids() { return this.service.grids(); }
}
