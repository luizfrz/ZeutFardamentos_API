import { Roles } from '../auth/roles.decorator.js';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { type CreateMoldDto, MoldsService } from './molds.service.js';

@Controller()
export class MoldsController {
  constructor(private readonly service: MoldsService) {}
  @Get('molds') list() { return this.service.list(); }
  @Post('molds') create(@Body() dto: CreateMoldDto) { return this.service.create(dto); }
  @Delete('molds/:id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Get('size-grids') grids() { return this.service.grids(); }
  @Roles('ADMIN') @Post('size-grids') createGrid(@Body() dto: { name?: string; description?: string; sizes?: unknown }) { return this.service.createGrid(dto); }
  @Roles('ADMIN') @Patch('size-grids/:id') updateGrid(@Param('id') id: string, @Body('sizes') sizes: unknown) { return this.service.updateGrid(id, sizes); }
}
