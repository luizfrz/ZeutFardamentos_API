import { Module } from '@nestjs/common';
import { ClientsModule } from './modules/clients/clients.module.js';
import { MoldsModule } from './modules/molds/molds.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ResponsiblesModule } from './modules/responsibles/responsibles.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({ imports: [PrismaModule, ClientsModule, ResponsiblesModule, MoldsModule, OrdersModule] })
export class AppModule {}
