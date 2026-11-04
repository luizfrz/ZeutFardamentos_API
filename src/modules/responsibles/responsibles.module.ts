import { Module } from '@nestjs/common';
import { ResponsiblesController } from './responsibles.controller.js';
import { ResponsiblesService } from './responsibles.service.js';

@Module({ controllers: [ResponsiblesController], providers: [ResponsiblesService], exports: [ResponsiblesService] })
export class ResponsiblesModule {}
