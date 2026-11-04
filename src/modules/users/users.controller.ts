import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UsersService } from './users.service.js';

/** Gestão de usuários: só administradores (o papel é conferido no banco a cada chamada). */
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get() list() { return this.service.list(); }
  @Post() create(@Body() body: { name?: string; email?: string; password?: string; role?: string }) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: { password?: string; role?: string }) { return this.service.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string, @Req() req: AuthedRequest) { return this.service.remove(id, req.user!.id); }
}
