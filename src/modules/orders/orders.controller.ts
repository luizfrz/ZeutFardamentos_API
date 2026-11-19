import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { OrderStatus } from '../../common/types.js';
import { OrdersService, type OrderInput, type OrderQuery } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get() list(@Query() query: OrderQuery) { return this.service.list(query); }
  @Get('summary') summary() { return this.service.summary(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: OrderInput) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<OrderInput>) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Patch(':id/status') status(@Param('id') id: string, @Body('status') status: OrderStatus) { return this.service.setStatus(id, status); }
  @Post(':id/payments') addPayment(@Param('id') id: string, @Body() b: { amount: number; paidAt?: string }) { return this.service.addPayment(id, b.amount, b.paidAt); }
  @Delete(':id/payments/:paymentId') removePayment(@Param('id') id: string, @Param('paymentId') paymentId: string) { return this.service.removePayment(id, paymentId); }
}
