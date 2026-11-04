import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { MoldsModule } from './modules/molds/molds.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ResponsiblesModule } from './modules/responsibles/responsibles.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ClientsModule, ResponsiblesModule, MoldsModule, OrdersModule],
  controllers: [HealthController],
})
export class AppModule {}
